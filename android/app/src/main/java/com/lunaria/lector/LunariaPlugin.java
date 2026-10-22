package com.lunaria.lector;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.backup.BackupManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Funciones nativas del lector: pantalla completa inmersiva, pantalla encendida, brillo,
 * teclas de volumen, color de las barras del sistema, apertura de .epub desde otras apps,
 * avisos del pomodoro, foco de audio, copia automática, accesos directos y widget.
 */
@CapacitorPlugin(name = "Lunaria")
public class LunariaPlugin extends Plugin {

    static volatile boolean volumeKeysEnabled = false;
    private static LunariaPlugin instance;
    /** Atajo recibido antes de que el plugin cargase (arranque en frío) */
    private static String pendingShortcut;

    @Override
    public void load() {
        instance = this;
        // El tamaño de letra lo controla el lector: que la escala de fuente del sistema no lo multiplique
        bridge.getWebView().getSettings().setTextZoom(100);
        if (pendingShortcut != null) {
            JSObject data = new JSObject();
            data.put("action", pendingShortcut);
            pendingShortcut = null;
            notifyListeners("shortcut", data, true);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        volumeKeysEnabled = false;
        pausedByFocus = false;
        soltarFoco();
        if (noisyRegistered) {
            try {
                getContext().unregisterReceiver(noisyReceiver);
            } catch (IllegalArgumentException ignored) {
                // ya estaba anulado
            }
            noisyRegistered = false;
        }
        AmbientService.detener(getContext());
    }

    private WindowInsetsControllerCompat insetsController() {
        Window window = getActivity().getWindow();
        return WindowCompat.getInsetsController(window, window.getDecorView());
    }

    /** ¿La app está fijada en pantalla ("Fijar aplicación") o en modo quiosco? */
    private boolean isPinned() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }

    @PluginMethod
    public void getPinned(PluginCall call) {
        JSObject res = new JSObject();
        res.put("pinned", isPinned());
        call.resolve(res);
    }

    /** Salida garantizada: deja de fijar la app (Android permite que la propia app lo haga). */
    @PluginMethod
    public void unpin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (isPinned()) getActivity().stopLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo dejar de fijar la app", e);
            }
        });
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat controller = insetsController();
            if (enabled) {
                // Las barras reaparecen un momento al deslizar desde el borde y se vuelven a ocultar solas
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                // Con la app fijada, la barra de navegación es la salida del sistema: nunca la ocultamos
                controller.hide(isPinned() ? WindowInsetsCompat.Type.statusBars() : WindowInsetsCompat.Type.systemBars());
                if (isPinned()) controller.show(WindowInsetsCompat.Type.navigationBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        Double value = call.getDouble("value", -1.0);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = value == null || value < 0
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : (float) Math.max(0.01, Math.min(1.0, value));
            window.setAttributes(params);
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolumeKeys(PluginCall call) {
        volumeKeysEnabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String color = call.getString("color", "#ffffff");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().getWindow().getDecorView().setBackgroundColor(Color.parseColor(color));
            } catch (IllegalArgumentException ignored) {
                // color no válido: se mantiene el anterior
            }
            WindowInsetsControllerCompat controller = insetsController();
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }

    /** Exportar desde la web: el WebView no descarga blob:, así que abrimos el menú Compartir. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "lunaria.txt").replaceAll("[\\\\/:*?\"<>|]+", "-");
        String data = call.getString("data", "");
        String mime = call.getString("mime", "application/octet-stream");
        try {
            File dir = new File(getContext().getCacheDir(), "compartir");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Sin caché");
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                f.delete();
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, name);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Guardar o compartir");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir el archivo", e);
        }
    }

    /** Traducción estable y sin conexión: envía la selección a las apps instaladas (Google Translate, DeepL…). */
    @PluginMethod
    public void translateWithApp(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            try {
                Intent process = new Intent(Intent.ACTION_PROCESS_TEXT);
                process.setType("text/plain");
                process.putExtra(Intent.EXTRA_PROCESS_TEXT, text);
                process.putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
                getActivity().startActivity(Intent.createChooser(process, "Traducir con…"));
                call.resolve();
            } catch (Exception e) {
                call.reject("No hay apps de traducción instaladas", e);
            }
        });
    }

    // ——— Pomodoro: cuenta atrás en la notificación y alarma al terminar ———

    @PluginMethod
    public void scheduleTimer(PluginCall call) {
        Long endsAt = call.getLong("endsAt");
        if (endsAt == null) {
            call.reject("Falta endsAt");
            return;
        }
        pedirPermisoAvisos();
        Avisos.programarFase(
            getContext(),
            endsAt,
            call.getString("title", "Pomodoro"),
            call.getString("body", ""),
            call.getString("endTitle", "Fase terminada"),
            call.getString("endBody", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void cancelTimer(PluginCall call) {
        Avisos.cancelarFase(getContext());
        call.resolve();
    }

    /** Android 13+: el permiso de avisos se pide una sola vez, al usar el pomodoro por primera vez. */
    private void pedirPermisoAvisos() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = getContext().getSharedPreferences("lunaria", Context.MODE_PRIVATE);
        if (prefs.getBoolean("avisosPedidos", false)) return;
        prefs.edit().putBoolean("avisosPedidos", true).apply();
        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4207);
    }

    // ——— Sonido ambiente: foco de audio, auriculares y pantalla apagada ———

    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean holdingFocus = false;
    private boolean pausedByFocus = false;
    private boolean noisyRegistered = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = (change) -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            // Otra app de audio o música: pausa y no vuelve sola
            pausedByFocus = false;
            emitAudioControl("pause", false);
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            // Llamada, nota de voz, navegador GPS…: pausa y vuelve al terminar
            pausedByFocus = true;
            emitAudioControl("pause", true);
        } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) {
            pausedByFocus = false;
            emitAudioControl("resume", false);
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // Se desconectan los auriculares: nunca suena de golpe por el altavoz
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) emitAudioControl("pause", false);
        }
    };

    @PluginMethod
    public void setAudioActive(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        boolean screenOff = Boolean.TRUE.equals(call.getBoolean("screenOff", false));
        String title = call.getString("title", "Sonido ambiente");
        Context ctx = getContext();
        if (audioManager == null) audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (active) {
            pausedByFocus = false;
            pedirFoco();
            if (!noisyRegistered) {
                ContextCompat.registerReceiver(ctx, noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
                noisyRegistered = true;
            }
            if (screenOff) AmbientService.iniciar(ctx, title);
            else AmbientService.detener(ctx);
        } else {
            // Pausado por una llamada: se conserva el foco para saber cuándo reanudar
            if (!pausedByFocus) soltarFoco();
            if (noisyRegistered) {
                try {
                    ctx.unregisterReceiver(noisyReceiver);
                } catch (IllegalArgumentException ignored) {
                    // ya estaba anulado
                }
                noisyRegistered = false;
            }
            AmbientService.detener(ctx);
        }
        call.resolve();
    }

    private void pedirFoco() {
        if (audioManager == null || holdingFocus) return;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(focusListener)
                .build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = legacyRequestFocus();
        }
        holdingFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private int legacyRequestFocus() {
        return audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
    }

    @SuppressWarnings("deprecation")
    private void soltarFoco() {
        if (audioManager == null || !holdingFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        else audioManager.abandonAudioFocus(focusListener);
        holdingFocus = false;
    }

    /** Devuelve false si la web no está viva para recibirlo. */
    static boolean emitAudioControl(String action, boolean transientLoss) {
        LunariaPlugin plugin = instance;
        if (plugin == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("transient", transientLoss);
        plugin.notifyListeners("audioControl", data);
        return true;
    }

    // ——— Copia automática: un resumen pequeño que Android guarda en la nube ———

    private File snapshotFile() {
        return new File(new File(getContext().getFilesDir(), "respaldo"), "lunaria.json");
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        String data = call.getString("data", "");
        new Thread(() -> {
            try {
                File file = snapshotFile();
                File dir = file.getParentFile();
                if (dir != null && !dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Sin carpeta de copia");
                File tmp = new File(dir, "lunaria.json.tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(data.getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                }
                if (!tmp.renameTo(file)) throw new IllegalStateException("No se pudo guardar la copia");
                new BackupManager(getContext()).dataChanged();
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo guardar la copia automática", e);
            }
        }).start();
    }

    @PluginMethod
    public void readSnapshot(PluginCall call) {
        JSObject res = new JSObject();
        File file = snapshotFile();
        if (!file.exists()) {
            call.resolve(res);
            return;
        }
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int off = 0;
            while (off < bytes.length) {
                int n = in.read(bytes, off, bytes.length - off);
                if (n < 0) break;
                off += n;
            }
            res.put("data", new String(bytes, 0, off, StandardCharsets.UTF_8));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("No se pudo leer la copia automática", e);
        }
    }

    // ——— Widget de inicio ———

    @PluginMethod
    public void updateWidget(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(RachaWidget.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("dia", call.getString("day", ""))
            .putInt("minutos", call.getInt("minutes", 0))
            .putInt("meta", call.getInt("goal", 20))
            .putInt("racha", call.getInt("streak", 0))
            .putString("rachaHasta", call.getString("streakUntil", ""))
            .putString("libro", call.getString("title", ""))
            .putInt("progreso", call.getInt("progress", 0))
            .apply();
        RachaWidget.actualizarTodos(ctx);
        call.resolve();
    }

    static void emitVolumeKey(String direction) {
        LunariaPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("direction", direction);
        plugin.notifyListeners("volumeKey", data);
    }

    /** Copia el EPUB recibido (VIEW o SEND) a la caché y avisa a la web para importarlo. */
    static void handleIntent(Activity activity, Intent intent) {
        if (intent == null) return;
        // Accesos directos y widget: lunaria://continuar, lunaria://pomodoro, lunaria://lluvia
        Uri link = intent.getData();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && link != null && "lunaria".equals(link.getScheme())) {
            intent.setAction(Intent.ACTION_MAIN);
            intent.setData(null);
            JSObject data = new JSObject();
            data.put("action", link.getHost());
            LunariaPlugin plugin = instance;
            if (plugin != null) plugin.notifyListeners("shortcut", data, true);
            else pendingShortcut = link.getHost();
            return;
        }
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) return;
        final Uri source = uri;
        // Evita reimportar el mismo intent si la actividad se recrea
        intent.setAction(Intent.ACTION_MAIN);
        new Thread(() -> {
            try {
                ContentResolver resolver = activity.getContentResolver();
                String name = displayName(resolver, source);
                File dir = new File(activity.getCacheDir(), "abiertos");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Sin caché");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                    f.delete();
                File target = new File(dir, "libro-" + System.currentTimeMillis() + ".epub");
                try (InputStream in = resolver.openInputStream(source); OutputStream out = new FileOutputStream(target)) {
                    if (in == null) throw new IllegalStateException("No se pudo leer el archivo");
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                }
                JSObject data = new JSObject();
                data.put("path", target.getAbsolutePath());
                data.put("name", name);
                LunariaPlugin plugin = instance;
                // retainUntilConsumed: si la web aún no escucha (arranque en frío), se entrega al suscribirse
                if (plugin != null) plugin.notifyListeners("fileOpened", data, true);
            } catch (Exception e) {
                Logger.error("Lunaria", "No se pudo abrir el archivo recibido", e);
            }
        }).start();
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
            } catch (Exception ignored) {
                // sin nombre disponible
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "libro.epub";
        if (!name.toLowerCase().endsWith(".epub")) name = name + ".epub";
        return name;
    }
}

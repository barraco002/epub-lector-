package com.lunaria.lector;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Funciones nativas del lector: pantalla completa inmersiva, pantalla encendida, brillo,
 * teclas de volumen, color de las barras del sistema y apertura de .epub desde otras apps.
 */
@CapacitorPlugin(name = "Lunaria")
public class LunariaPlugin extends Plugin {

    static volatile boolean volumeKeysEnabled = false;
    private static LunariaPlugin instance;

    @Override
    public void load() {
        instance = this;
        // El tamaño de letra lo controla el lector: que la escala de fuente del sistema no lo multiplique
        bridge.getWebView().getSettings().setTextZoom(100);
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        volumeKeysEnabled = false;
    }

    private WindowInsetsControllerCompat insetsController() {
        Window window = getActivity().getWindow();
        return WindowCompat.getInsetsController(window, window.getDecorView());
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat controller = insetsController();
            if (enabled) {
                // Las barras reaparecen un momento al deslizar desde el borde y se vuelven a ocultar solas
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
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

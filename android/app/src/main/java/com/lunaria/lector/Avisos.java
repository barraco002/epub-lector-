package com.lunaria.lector;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Notificaciones del pomodoro y del sonido ambiente. El pomodoro no usa ningún servicio:
 * una notificación con cuenta atrás (la dibuja el sistema) y una alarma al final de la fase.
 */
final class Avisos {

    static final String CANAL_CURSO = "pomodoro_curso";
    static final String CANAL_FIN = "pomodoro_fin";
    static final String CANAL_SONIDO = "sonido";
    static final int ID_CURSO = 1;
    static final int ID_FIN = 2;
    static final int ID_SONIDO = 3;
    private static final int RC_ALARMA = 70;

    private Avisos() {}

    static void crearCanales(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel curso = new NotificationChannel(CANAL_CURSO, "Pomodoro en curso", NotificationManager.IMPORTANCE_LOW);
        curso.setDescription("Cuenta atrás de la fase actual");
        curso.setShowBadge(false);
        NotificationChannel fin = new NotificationChannel(CANAL_FIN, "Fin de pomodoro", NotificationManager.IMPORTANCE_HIGH);
        fin.setDescription("Aviso al terminar el enfoque o el descanso");
        fin.enableVibration(true);
        NotificationChannel sonido = new NotificationChannel(CANAL_SONIDO, "Sonido ambiente", NotificationManager.IMPORTANCE_LOW);
        sonido.setDescription("Controles mientras suena con la pantalla apagada");
        sonido.setShowBadge(false);
        nm.createNotificationChannel(curso);
        nm.createNotificationChannel(fin);
        nm.createNotificationChannel(sonido);
    }

    static boolean puedeNotificar(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    /** Abre la app (o la trae al frente). Con acción, la web la recibe como atajo. */
    static PendingIntent abrirApp(Context ctx, String accion) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int code = 0;
        if (accion != null) {
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse("lunaria://" + accion));
            code = accion.hashCode();
        }
        return PendingIntent.getActivity(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent alarma(Context ctx, String titulo, String texto) {
        Intent intent = new Intent(ctx, LunariaReceiver.class).setAction(LunariaReceiver.ACCION_FIN_FASE);
        intent.putExtra("titulo", titulo);
        intent.putExtra("texto", texto);
        return PendingIntent.getBroadcast(ctx, RC_ALARMA, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Cuenta atrás en la notificación + alarma exacta (o casi exacta si el sistema no la permite). */
    static void programarFase(Context ctx, long terminaEn, String titulo, String texto, String tituloFin, String textoFin) {
        crearCanales(ctx);
        if (puedeNotificar(ctx)) {
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CANAL_CURSO)
                .setSmallIcon(R.drawable.ic_stat_lunaria)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setWhen(terminaEn)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(abrirApp(ctx, null));
            try {
                NotificationManagerCompat.from(ctx).notify(ID_CURSO, b.build());
            } catch (SecurityException ignored) {
                // permiso retirado entre la comprobación y el aviso
            }
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarma(ctx, tituloFin, textoFin);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, terminaEn, pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, terminaEn, pi);
        }
    }

    static void cancelarFase(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarma(ctx, null, null));
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        nm.cancel(ID_CURSO);
        nm.cancel(ID_FIN);
    }

    static void avisarFinDeFase(Context ctx, String titulo, String texto) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        nm.cancel(ID_CURSO);
        // Con la app delante, la web ya lo celebra con su sonido y su aviso
        if (MainActivity.enPrimerPlano || !puedeNotificar(ctx)) return;
        crearCanales(ctx);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CANAL_FIN)
            .setSmallIcon(R.drawable.ic_stat_lunaria)
            .setContentTitle(titulo != null ? titulo : "Fase terminada")
            .setContentText(texto)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(abrirApp(ctx, null));
        try {
            nm.notify(ID_FIN, b.build());
        } catch (SecurityException ignored) {
            // sin permiso: la app lo mostrará al volver
        }
    }
}

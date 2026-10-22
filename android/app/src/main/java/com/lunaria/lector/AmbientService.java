package com.lunaria.lector;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Mantiene viva la app mientras suena el ambiente con la pantalla apagada.
 * Solo existe mientras hay sonido y el usuario activó la opción; no hace ningún trabajo propio.
 */
public class AmbientService extends Service {

    static void iniciar(Context ctx, String titulo) {
        Intent intent = new Intent(ctx, AmbientService.class).putExtra("titulo", titulo);
        try {
            ContextCompat.startForegroundService(ctx, intent);
        } catch (RuntimeException ignored) {
            // Android puede negarlo (p. ej. desde segundo plano): el sonido sigue mientras la app viva
        }
    }

    static void detener(Context ctx) {
        ctx.stopService(new Intent(ctx, AmbientService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Avisos.crearCanales(this);
        String titulo = intent != null ? intent.getStringExtra("titulo") : null;
        PendingIntent pausar = PendingIntent.getBroadcast(
            this,
            71,
            new Intent(this, LunariaReceiver.class).setAction(LunariaReceiver.ACCION_PAUSAR_SONIDO),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification n = new NotificationCompat.Builder(this, Avisos.CANAL_SONIDO)
            .setSmallIcon(R.drawable.ic_stat_lunaria)
            .setContentTitle(titulo != null && !titulo.isEmpty() ? titulo : "Sonido ambiente")
            .setContentText("Sigue sonando con la pantalla apagada")
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(Avisos.abrirApp(this, null))
            .addAction(0, "Pausar", pausar)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(Avisos.ID_SONIDO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(Avisos.ID_SONIDO, n);
            }
        } catch (RuntimeException e) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

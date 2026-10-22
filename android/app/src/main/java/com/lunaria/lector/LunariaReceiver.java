package com.lunaria.lector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarma de fin de fase del pomodoro y botón «Pausar» de la notificación de sonido. */
public class LunariaReceiver extends BroadcastReceiver {

    static final String ACCION_FIN_FASE = "com.lunaria.lector.FIN_FASE";
    static final String ACCION_PAUSAR_SONIDO = "com.lunaria.lector.PAUSAR_SONIDO";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACCION_FIN_FASE.equals(action)) {
            Avisos.avisarFinDeFase(context, intent.getStringExtra("titulo"), intent.getStringExtra("texto"));
        } else if (ACCION_PAUSAR_SONIDO.equals(action)) {
            // La web pausa el sonido y, al hacerlo, detiene el servicio
            if (!LunariaPlugin.emitAudioControl("pause", false)) AmbientService.detener(context);
        }
    }
}

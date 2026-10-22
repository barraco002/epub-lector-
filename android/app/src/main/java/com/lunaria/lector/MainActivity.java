package com.lunaria.lector;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Con la app delante, los avisos del pomodoro los da la propia web. */
    static volatile boolean enPrimerPlano = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LunariaPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        enPrimerPlano = true;
    }

    @Override
    public void onPause() {
        enPrimerPlano = false;
        super.onPause();
    }

    /** BridgeActivity también lo llama al arrancar con el intent inicial ("Abrir con Lunaria"). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        LunariaPlugin.handleIntent(this, intent);
    }

    /** Teclas de volumen para pasar pantalla mientras se lee (solo si el lector lo activó). */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (LunariaPlugin.volumeKeysEnabled && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                LunariaPlugin.emitVolumeKey(code == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}

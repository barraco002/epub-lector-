package com.lunaria.lector;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Widget de inicio: racha, minutos de hoy y el libro en curso. La app le pasa los datos al
 * cambiar; el sistema solo lo redibuja unas pocas veces al día (para el cambio de fecha).
 */
public class RachaWidget extends AppWidgetProvider {

    static final String PREFS = "lunaria_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) dibujar(context, manager, id);
    }

    static void actualizarTodos(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, RachaWidget.class));
        for (int id : ids) dibujar(ctx, manager, id);
    }

    private static void dibujar(Context ctx, AppWidgetManager manager, int id) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
        // Datos de otro día: los minutos vuelven a cero y la racha solo sigue si aún no caducó
        boolean deHoy = hoy.equals(p.getString("dia", ""));
        int minutos = deHoy ? p.getInt("minutos", 0) : 0;
        int meta = Math.max(1, p.getInt("meta", 20));
        String vivaHasta = p.getString("rachaHasta", "");
        int racha = vivaHasta.compareTo(hoy) >= 0 ? p.getInt("racha", 0) : 0;
        String libro = p.getString("libro", "");
        int progreso = p.getInt("progreso", 0);

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_racha);
        v.setTextViewText(R.id.w_racha, "🔥 " + racha);
        v.setTextViewText(R.id.w_hoy, minutos >= meta
            ? ctx.getString(R.string.widget_goal_met, minutos)
            : ctx.getString(R.string.widget_goal_progress, minutos, meta));
        v.setProgressBar(R.id.w_meta, meta, Math.min(minutos, meta), false);
        if (libro.isEmpty()) {
            v.setTextViewText(R.id.w_libro, ctx.getString(R.string.widget_open_book));
            v.setViewVisibility(R.id.w_progreso, View.GONE);
        } else {
            v.setTextViewText(R.id.w_libro, libro);
            v.setTextViewText(R.id.w_progreso, progreso + "%");
            v.setViewVisibility(R.id.w_progreso, View.VISIBLE);
        }
        v.setOnClickPendingIntent(R.id.w_raiz, Avisos.abrirApp(ctx, "continuar"));
        manager.updateAppWidget(id, v);
    }
}

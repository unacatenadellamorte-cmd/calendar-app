package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.GlanceAppWidgetManager

internal const val MONTH_OFFSET_KEY = "monthWidgetOffset"

private suspend fun shiftMonth(context: Context, glanceId: GlanceId, amount: Int) {
    val preferences = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
    val current = preferences.getInt(MONTH_OFFSET_KEY, 0)
    // 再描画より先に値を確実に永続化する。apply() の非同期書き込みだと、
    // Glance が古い月を読み込んで表示が変わらないことがある。
    preferences.edit().putInt(MONTH_OFFSET_KEY, (current + amount).coerceIn(-120, 120)).commit()
    // まずタップされた個体を即時更新し、ランチャー側のGlanceキャッシュが
    // 残っている場合に備えて全個体も更新する。
    MonthEventsWidget().update(context, glanceId)
    GlanceAppWidgetManager(context)
        .getGlanceIds(MonthEventsWidget::class.java)
        .forEach { widgetId ->
            if (widgetId != glanceId) MonthEventsWidget().update(context, widgetId)
        }
}

/** 月ウィジェットを前月へ移動する。 */
class MonthPreviousAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftMonth(context, glanceId, -1)
    }
}

/** 月ウィジェットを次月へ移動する。 */
class MonthNextAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftMonth(context, glanceId, 1)
    }
}

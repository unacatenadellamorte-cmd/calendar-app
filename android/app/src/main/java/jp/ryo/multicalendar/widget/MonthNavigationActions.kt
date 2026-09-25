package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

internal const val MONTH_OFFSET_KEY = "monthWidgetOffset"

private suspend fun shiftMonth(context: Context, glanceId: GlanceId, amount: Int) {
    val preferences = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
    val current = preferences.getInt(MONTH_OFFSET_KEY, 0)
    preferences.edit().putInt(MONTH_OFFSET_KEY, (current + amount).coerceIn(-120, 120)).apply()
    // 対象のウィジェットだけを直接更新し、全ウィジェット向けのブロードキャスト待ちを避ける。
    MonthEventsWidget().update(context, glanceId)
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

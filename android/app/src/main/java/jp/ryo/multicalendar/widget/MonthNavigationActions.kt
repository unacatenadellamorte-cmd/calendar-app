package jp.ryo.multicalendar.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

internal const val MONTH_OFFSET_KEY = "monthWidgetOffset"

private fun shiftMonth(context: Context, amount: Int) {
    val preferences = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
    val current = preferences.getInt(MONTH_OFFSET_KEY, 0)
    preferences.edit().putInt(MONTH_OFFSET_KEY, (current + amount).coerceIn(-120, 120)).apply()
    // Glanceの更新完了をタップ処理で待たず、レシーバーへ非同期更新を依頼する。
    context.sendBroadcast(
        Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
            component = ComponentName(context, MonthEventsWidgetReceiver::class.java)
        },
    )
}

/** 月ウィジェットを前月へ移動する。 */
class MonthPreviousAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftMonth(context, -1)
    }
}

/** 月ウィジェットを次月へ移動する。 */
class MonthNextAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftMonth(context, 1)
    }
}

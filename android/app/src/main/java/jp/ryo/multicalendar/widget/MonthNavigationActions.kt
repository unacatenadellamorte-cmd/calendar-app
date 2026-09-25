package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.appwidget.state.updateAppWidgetState

internal const val MONTH_OFFSET_KEY = "monthWidgetOffset"
internal val MONTH_OFFSET_STATE = intPreferencesKey(MONTH_OFFSET_KEY)

private suspend fun shiftMonth(context: Context, glanceId: GlanceId, amount: Int) {
    val legacyOffset = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        .getInt(MONTH_OFFSET_KEY, 0)
    // Glanceが監視する状態を更新する。連打時も読出しと加算を同じ取引で行う。
    updateAppWidgetState(context, glanceId) { state ->
        state[MONTH_OFFSET_STATE] = ((state[MONTH_OFFSET_STATE] ?: legacyOffset) + amount)
            .coerceIn(-120, 120)
    }
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

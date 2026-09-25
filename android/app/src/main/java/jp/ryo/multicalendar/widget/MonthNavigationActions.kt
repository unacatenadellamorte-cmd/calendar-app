package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.datastore.preferences.core.intPreferencesKey

internal const val MONTH_OFFSET_KEY = "monthWidgetOffset"
internal val MONTH_OFFSET_STATE = intPreferencesKey(MONTH_OFFSET_KEY)

private suspend fun shiftMonth(context: Context, glanceId: GlanceId, amount: Int) {
    val legacyOffset = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        .getInt(MONTH_OFFSET_KEY, 0)
    navigateWidget(context, glanceId, MonthEventsWidget(), MONTH_OFFSET_STATE, amount, 120, legacyOffset)
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

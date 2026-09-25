package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

internal const val WEEK_OFFSET_KEY = "weekWidgetOffset"
internal val WEEK_OFFSET_STATE = intPreferencesKey(WEEK_OFFSET_KEY)

private suspend fun shiftWeek(context: Context, glanceId: GlanceId, amount: Int) {
    navigateWidget(context, glanceId, WeekEventsWidget(), WEEK_OFFSET_STATE, amount, 520)
}

/** 週ウィジェットを前週へ移動する。 */
class WeekPreviousAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftWeek(context, glanceId, -1)
    }
}

/** 週ウィジェットを翌週へ移動する。 */
class WeekNextAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        shiftWeek(context, glanceId, 1)
    }
}

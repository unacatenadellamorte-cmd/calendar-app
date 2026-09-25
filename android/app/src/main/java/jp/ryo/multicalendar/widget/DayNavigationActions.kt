package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

internal val DAY_OFFSET_STATE = intPreferencesKey("dayWidgetOffset")

class DayPreviousAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        navigateWidget(context, glanceId, FeaturedEventsWidget(), DAY_OFFSET_STATE, -1, 3660)
    }
}

class DayNextAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        navigateWidget(context, glanceId, FeaturedEventsWidget(), DAY_OFFSET_STATE, 1, 3660)
    }
}

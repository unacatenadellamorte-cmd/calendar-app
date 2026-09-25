package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.glance.LocalContext
import androidx.glance.LocalGlanceId
import androidx.glance.appwidget.AppWidgetId
import java.util.concurrent.atomic.AtomicInteger

internal data class WidgetSnapshot(val overview: CalendarOverview, val appearance: WidgetAppearance)

/** アプリからの予定・並び順・テーマの更新を全ウィジェットへ反映する。 */
@Composable
internal fun rememberWidgetSnapshot(): WidgetSnapshot {
    val context = LocalContext.current
    val id = (LocalGlanceId.current as AppWidgetId).appWidgetId
    DisposableEffect(id) {
        val active = activeWidgetCompositions.getOrPut(id) { AtomicInteger() }
        active.incrementAndGet()
        onDispose { active.decrementAndGet() }
    }
    val preferences = remember(context) { context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE) }
    var dataRevision by remember { mutableIntStateOf(0) }
    DisposableEffect(preferences) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == null || key == CALENDAR_OVERVIEW_KEY || key == WIDGET_APPEARANCE_KEY) dataRevision++
        }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        // 初回読出しからリスナー登録までに更新された場合も再読出しする。
        dataRevision++
        onDispose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    val overview = remember(dataRevision) { readCalendarOverview(context) }
    val appearance = remember(dataRevision) { readWidgetAppearance(context) }
    return WidgetSnapshot(overview, appearance)
}

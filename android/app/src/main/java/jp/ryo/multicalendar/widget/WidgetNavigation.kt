package jp.ryo.multicalendar.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.currentState
import androidx.glance.LocalGlanceId
import androidx.glance.appwidget.AppWidgetId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import kotlinx.coroutines.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// 同じウィジェットへの連続操作は、保存と描画をまとめて直列化する。
private val navigationLocks = Array(16) { Mutex() }
internal val activeWidgetCompositions = ConcurrentHashMap<Int, AtomicInteger>()
private val currentOffsets = ConcurrentHashMap<Int, MutableStateFlow<Int?>>()

/** 稼働中の描画にも保存直後の選択を渡し、遅れて届く旧Glance状態で巻き戻さない。 */
@Composable
internal fun widgetDateOffset(key: Preferences.Key<Int>, initialOffset: Int = 0): Int {
    val id = (LocalGlanceId.current as AppWidgetId).appWidgetId
    val selected by currentOffsets.getOrPut(id) { MutableStateFlow(null) }.collectAsState()
    return selected ?: currentState<Preferences>()[key] ?: initialOffset
}

internal fun forgetWidgetDate(glanceId: GlanceId) {
    currentOffsets.remove((glanceId as AppWidgetId).appWidgetId)
}

internal suspend fun navigateWidget(
    context: Context,
    glanceId: GlanceId,
    widget: GlanceAppWidget,
    key: Preferences.Key<Int>,
    amount: Int,
    limit: Int,
    initialOffset: Int = 0,
) {
    val id = (glanceId as AppWidgetId).appWidgetId
    val started = SystemClock.elapsedRealtime()
    navigationLocks[(id and Int.MAX_VALUE) % navigationLocks.size].withLock {
        var selected = initialOffset
        updateAppWidgetState(context, glanceId) { state ->
            selected = ((state[key] ?: initialOffset) + amount).coerceIn(-limit, limit)
            state[key] = selected
        }
        val alreadyRendering = (activeWidgetCompositions[id]?.get() ?: 0) > 0
        currentOffsets.getOrPut(id) { MutableStateFlow(null) }.value = selected
        if (alreadyRendering) {
            // 稼働中は既存の描画を使い、同じ画面を二重生成しない。
            widget.update(context, glanceId)
            Log.i("WidgetNavigation", "id=$id liveMs=${SystemClock.elapsedRealtime() - started}")
            return@withLock
        }
        // 月・週は通常Viewのみ。日のリストはAndroid 12以降の埋込方式で即時描画できる。
        if (widget !is FeaturedEventsWidget || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val manager = AppWidgetManager.getInstance(context)
                val state = widget.getAppWidgetState<Preferences>(context, glanceId)
                val views = widget.compose(context, glanceId, options = manager.getAppWidgetOptions(id), state = state)
                manager.updateAppWidget(id, views)
                Log.i("WidgetNavigation", "id=$id renderMs=${SystemClock.elapsedRealtime() - started}")
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w("WidgetNavigation", "即時描画に失敗: id=$id", error)
                widget.update(context, glanceId)
            }
        } else {
            widget.update(context, glanceId)
        }
    }
}

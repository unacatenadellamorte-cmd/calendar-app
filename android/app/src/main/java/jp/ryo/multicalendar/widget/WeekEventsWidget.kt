package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.width
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/** 週の7日を横並びで表示するウィジェット。 */
class WeekEventsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { WeekEventsContent() }
    }
}

@Composable
private fun WeekEventsContent() {
    val context = LocalContext.current
    val snapshot = rememberWidgetSnapshot()
    val overview = snapshot.overview
    val appearance = snapshot.appearance
    val size = LocalSize.current
    val fontScale = context.resources.configuration.fontScale * appearance.appFontScale
    val scale = fontScale.coerceAtLeast(1f)
    val today = todayWidgetDay()
    val offset = currentState<Preferences>()[WEEK_OFFSET_STATE] ?: 0
    val days = weekWidgetDays(addWidgetDays(today, offset * 7))
    val headerHeight = 28f * scale
    val weekdayHeight = 16f * scale
    val cellHeightDp = (size.height.value - 12f - headerHeight - weekdayHeight).coerceAtLeast(1f)

    Column(modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor).padding(6.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(headerHeight.dp)) {
            Row(modifier = GlanceModifier.width(64.dp)) {
                Text("▲", style = TextStyle(fontSize = scaledSp(13f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.clickable(actionRunCallback<WeekPreviousAction>()).padding(horizontal = 4.dp, vertical = 2.dp))
                Spacer(modifier = GlanceModifier.width(10.dp))
                Text("▼", style = TextStyle(fontSize = scaledSp(13f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.clickable(actionRunCallback<WeekNextAction>()).padding(horizontal = 4.dp, vertical = 2.dp))
            }
            Text(if (size.width.value < 300f) "${days.first().year}/${days.first().month}" else weekHeaderText(days), maxLines = 1, style = TextStyle(fontSize = scaledSp(if (size.width.value < 250f) 11f else 16f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight())
            Text("＋", style = TextStyle(fontSize = scaledSp(16f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor), textAlign = TextAlign.End), modifier = GlanceModifier.width(64.dp).clickable(actionStartActivity(createWidgetIntent(context, days.first()))).padding(horizontal = 5.dp, vertical = 2.dp))
        }
        Row(modifier = GlanceModifier.fillMaxWidth().height(weekdayHeight.dp)) {
            days.forEach { day ->
                Text(widgetWeekdayLabel(day, overview.language), style = TextStyle(fontSize = scaledSp(9f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().padding(1.dp))
            }
        }
        Row(modifier = GlanceModifier.fillMaxWidth().height(cellHeightDp.dp)) {
            days.forEach { day ->
                CalendarWidgetDayCell(context, overview, appearance, today, day, cellHeightDp, fontScale, GlanceModifier.defaultWeight())
            }
        }
    }
}

internal fun weekHeaderText(days: List<WidgetDay>): String {
    if (days.isEmpty()) return ""
    val first = days.first()
    val last = days.last()
    return when {
        first.year != last.year -> "${first.year}/${first.month}/${first.day}–${last.year}/${last.month}/${last.day}"
        first.month != last.month -> "${first.year}/${first.month}/${first.day}–${last.month}/${last.day}"
        else -> "${first.year}/${first.month}/${first.day}–${last.day}"
    }
}

internal fun shortWidgetTitle(value: String, maxLength: Int): String = value.trim().let { if (it.length <= maxLength) it else it.take(maxLength - 1) + "…" }

/** 既存の呼出し側向けに、予定の件名を1件1行で要約する。 */
internal fun weekEventSummary(events: List<CalendarOverviewEvent>): String = events.joinToString("\n") { shortWidgetTitle(it.title.ifBlank { it.calendarName }, 7) }

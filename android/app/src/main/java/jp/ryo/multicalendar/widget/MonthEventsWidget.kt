package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.Spacer
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.TextAlign
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/** 今月の7列カレンダー。月またぎの日も表示し、日付タップはその日の作成画面へ進む。 */
class MonthEventsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { MonthEventsContent() }
    }
}


@Composable
private fun MonthEventsContent() {
    val context = LocalContext.current
    val overview = readCalendarOverview(context)
    val appearance = readWidgetAppearance(context)
    val size = LocalSize.current
    val fontScale = context.resources.configuration.fontScale * appearance.appFontScale
    val today = todayWidgetDay()
    val days = monthWidgetDays(today)
    val rows = days.chunked(7)
    val cellHeightDp = monthCellHeightDp(size.height.value, rows.size, fontScale)
    Column(
        modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor).padding(6.dp),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth().height((24f * fontScale.coerceAtLeast(1f)).dp)) {
            Text(
                text = "${today.year}/${today.month} ${widgetText(overview.language, "month")}",
                style = TextStyle(fontSize = scaledSp(14f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor)),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                text = "＋",
                style = TextStyle(fontSize = scaledSp(18f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor)),
                modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, today))).padding(2.dp),
            )
        }
        Row(modifier = GlanceModifier.fillMaxWidth().height((20f * fontScale.coerceAtLeast(1f)).dp)) {
            (0..6).forEach { index ->
                Text(
                    text = widgetWeekdayLabel(days[index], overview.language),
                    style = TextStyle(fontSize = scaledSp(9f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor)),
                    modifier = GlanceModifier.defaultWeight().padding(1.dp),
                )
            }
        }
        rows.forEachIndexed { rowIndex, row ->
            Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                row.forEachIndexed { dayIndex, day ->
                    MonthDayCell(
                        context,
                        overview,
                        appearance,
                        today,
                        day,
                        cellHeightDp,
                        fontScale,
                        dayIndex < row.lastIndex,
                        GlanceModifier.defaultWeight(),
                    )
                }
            }
            if (rowIndex < rows.lastIndex) {
                Spacer(
                    modifier = GlanceModifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(appearance.secondaryTextColor),
                )
            }
        }
    }
}

@Composable
private fun MonthDayCell(
    context: Context,
    overview: CalendarOverview,
    appearance: WidgetAppearance,
    today: WidgetDay,
    day: WidgetDay,
    cellHeightDp: Float,
    fontScale: Float,
    showDivider: Boolean,
    cellModifier: GlanceModifier,
) {
    val events = eventsForWidgetDay(overview.events, day)
    val visibleEvents = events.take(monthVisibleEventCount(cellHeightDp, events.size, fontScale))
    val overflowCount = events.size - visibleEvents.size
    val isToday = day == today
    val inCurrentMonth = day.month == today.month && day.year == today.year
    Row(modifier = cellModifier.fillMaxHeight()) {
        Column(
            modifier = GlanceModifier
                .defaultWeight()
                .fillMaxHeight()
                .background(if (isToday) appearance.todayColor else Color.Transparent)
                .clickable(actionStartActivity(createWidgetIntent(context, day)))
                .padding(2.dp),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(
                    text = day.day.toString(),
                    style = TextStyle(
                        fontSize = scaledSp(12f, appearance),
                        fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                        color = ColorProvider(
                            when {
                                isToday -> appearance.todayTextColor
                                inCurrentMonth -> appearance.primaryTextColor
                                else -> appearance.mutedTextColor
                            },
                        ),
                        textAlign = TextAlign.Center,
                    ),
                    modifier = GlanceModifier.defaultWeight().fillMaxWidth(),
                )
                if (overflowCount > 0) {
                    Text(
                        text = widgetOverflowCountText(overflowCount),
                        style = TextStyle(fontSize = scaledSp(7f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor)),
                        maxLines = 1,
                    )
                }
            }
            visibleEvents.forEach { event ->
                Text(
                    text = "• ${shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7)}",
                    style = TextStyle(fontSize = scaledSp(10f, appearance), color = ColorProvider(appearance.accentColor)),
                    maxLines = 1,
                )
            }
        }
        if (showDivider) {
            Spacer(
                modifier = GlanceModifier
                    .fillMaxHeight()
                    .width(1.dp)
                    .background(appearance.secondaryTextColor),
            )
        }
    }
}

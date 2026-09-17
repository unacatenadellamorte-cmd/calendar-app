package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
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
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
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
    val today = todayWidgetDay()
    val days = monthWidgetDays(today)
    val rows = days.chunked(7)
    Column(
        modifier = GlanceModifier.fillMaxSize().background(Color.White).padding(6.dp),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(24.dp)) {
            Text(
                text = "${today.year}/${today.month} ${widgetText(overview.language, "month")}",
                style = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color.Black)),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                text = "＋",
                style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color(0xFF0072B2))),
                modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, today))).padding(2.dp),
            )
        }
        Row(modifier = GlanceModifier.fillMaxWidth().height(20.dp)) {
            (0..6).forEach { index ->
                Text(
                    text = widgetWeekdayLabel(days[index], overview.language),
                    style = TextStyle(fontSize = 9.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color.DarkGray)),
                    modifier = GlanceModifier.defaultWeight().padding(1.dp),
                )
            }
        }
        rows.forEach { row ->
            Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                row.forEach { day -> MonthDayCell(context, overview, today, day, GlanceModifier.defaultWeight()) }
            }
        }
    }
}

@Composable
private fun MonthDayCell(
    context: Context,
    overview: CalendarOverview,
    today: WidgetDay,
    day: WidgetDay,
    cellModifier: GlanceModifier,
) {
    val events = eventsForWidgetDay(overview.events, day)
    val title = events.firstOrNull()?.let { shortWidgetTitle(it.title.ifBlank { it.calendarName }, 7) } ?: ""
    val isToday = day == today
    val inCurrentMonth = day.month == today.month && day.year == today.year
    Column(
        modifier = cellModifier
            .fillMaxHeight()
            .background(if (isToday) Color(0xFFEAF4FF) else Color.Transparent)
            .clickable(actionStartActivity(createWidgetIntent(context, day)))
            .padding(2.dp),
    ) {
        Text(
            text = day.day.toString(),
            style = TextStyle(
                fontSize = 10.sp,
                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                color = ColorProvider(
                    when {
                        isToday -> Color(0xFF005A9C)
                        inCurrentMonth -> Color.Black
                        else -> Color.LightGray
                    },
                ),
            ),
        )
        if (title.isNotBlank()) {
            Text(
                text = "• $title",
                style = TextStyle(fontSize = 7.sp, color = ColorProvider(Color(0xFF0072B2))),
                maxLines = 1,
            )
        }
    }
}

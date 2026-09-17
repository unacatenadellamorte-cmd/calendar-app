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
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/** 今週(日曜始まり)を表示するウィジェット。予定データはcalendarOverviewだけを読む。 */
class WeekEventsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { WeekEventsContent() }
    }
}


@Composable
private fun WeekEventsContent() {
    val context = LocalContext.current
    val overview = readCalendarOverview(context)
    val today = todayWidgetDay()
    val days = weekWidgetDays(today)
    Column(
        modifier = GlanceModifier.fillMaxSize().background(Color.White).padding(8.dp),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(24.dp)) {
            Text(
                text = "${widgetText(overview.language, "week")} ${days.first().month}/${days.first().day}–${days.last().month}/${days.last().day}",
                style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color.Black)),
                modifier = GlanceModifier.defaultWeight(),
            )
            AddWeekButton(context, today)
        }
        days.forEach { day ->
            WeekDayRow(context, overview, day, day == today, GlanceModifier.defaultWeight())
        }
    }
}

@Composable
private fun AddWeekButton(context: Context, today: WidgetDay) {
    Text(
        text = "＋",
        style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color(0xFF0072B2))),
        modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, today))).padding(2.dp),
    )
}

@Composable
private fun WeekDayRow(
    context: Context,
    overview: CalendarOverview,
    day: WidgetDay,
    isToday: Boolean,
    rowModifier: GlanceModifier,
) {
    val events = eventsForWidgetDay(overview.events, day)
    val summary = events.joinToString("・") { shortWidgetTitle(it.title.ifBlank { it.calendarName }, 18) }
    Row(
        modifier = rowModifier
            .fillMaxWidth()
            .background(if (isToday) Color(0xFFEAF4FF) else Color.Transparent)
            .clickable(actionStartActivity(dayWidgetIntent(context, day)))
            .padding(2.dp),
    ) {
        Text(
            text = "${widgetWeekdayLabel(day, overview.language)} ${day.day}",
            style = TextStyle(
                fontSize = 10.sp,
                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                color = ColorProvider(if (isToday) Color(0xFF005A9C) else Color.DarkGray),
            ),
            modifier = GlanceModifier.width(42.dp),
        )
        Text(
            text = if (summary.isBlank()) "" else summary,
            style = TextStyle(fontSize = 10.sp, color = ColorProvider(Color.Black)),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            text = "＋",
            style = TextStyle(fontSize = 14.sp, color = ColorProvider(Color(0xFF0072B2))),
            modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, day))),
        )
    }
}

internal fun shortWidgetTitle(value: String, maxLength: Int): String =
    value.trim().let { if (it.length <= maxLength) it else it.take(maxLength - 1) + "…" }

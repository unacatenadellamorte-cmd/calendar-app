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
import androidx.glance.appwidget.action.actionRunCallback
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
    val monthOffset = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE).getInt(MONTH_OFFSET_KEY, 0)
    val displayedMonth = monthAnchor(today, monthOffset)
    val days = monthGridDays(displayedMonth.year, displayedMonth.month)
    // 曜日は必ず日曜始まりにする。月初の曜日を起点にすると、9月は火曜始まりになってしまう。
    val weekdayDays = weekWidgetDays(displayedMonth)
    val rows = days.chunked(7)
    val dividerHeight = (rows.size - 1).coerceAtLeast(0).toFloat()
    val headerHeight = 28f * fontScale.coerceAtLeast(1f)
    val weekdayHeight = 16f * fontScale.coerceAtLeast(1f)
    val cellHeightDp = ((size.height.value - 12f - headerHeight - weekdayHeight - dividerHeight) / rows.size)
        .coerceAtLeast(1f)
    Column(
        modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor).padding(6.dp),
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(headerHeight.dp)) {
            Row(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = "▲",
                    style = TextStyle(fontSize = scaledSp(13f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor)),
                    modifier = GlanceModifier.clickable(actionRunCallback<MonthPreviousAction>()).padding(horizontal = 7.dp, vertical = 2.dp),
                )
                Spacer(modifier = GlanceModifier.width(10.dp))
                Text(
                    text = "▼",
                    style = TextStyle(fontSize = scaledSp(13f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor)),
                    modifier = GlanceModifier.clickable(actionRunCallback<MonthNextAction>()).padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
            Text(
                text = "${displayedMonth.year}/${displayedMonth.month}${widgetText(overview.language, "month")}",
                style = TextStyle(fontSize = scaledSp(16f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor), textAlign = TextAlign.Center),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                text = "＋",
                style = TextStyle(fontSize = scaledSp(16f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor), textAlign = TextAlign.End),
                modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(createWidgetIntent(context, displayedMonth))).padding(horizontal = 5.dp, vertical = 2.dp),
            )
        }
        Row(modifier = GlanceModifier.fillMaxWidth().height(weekdayHeight.dp)) {
            (0..6).forEach { index ->
                Text(
                    text = widgetWeekdayLabel(weekdayDays[index], overview.language),
                    style = TextStyle(fontSize = scaledSp(9f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor), textAlign = TextAlign.Center),
                    modifier = GlanceModifier.defaultWeight().padding(1.dp),
                )
            }
        }
        Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            rows.forEach { row ->
                // グリッドを1つの子にまとめ、Glanceの子要素上限で5週目以降が落ちないようにする。
                Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                    Row(modifier = GlanceModifier.fillMaxWidth().height(cellHeightDp.coerceAtMost(72f).dp)) {
                        row.forEach { day ->
                            if (day == null) {
                                MonthBlankCell(GlanceModifier.defaultWeight())
                            } else {
                                MonthDayCell(
                                    context,
                                    overview,
                                    appearance,
                                    today,
                                    displayedMonth,
                                    day,
                                    cellHeightDp,
                                    fontScale,
                                    GlanceModifier.defaultWeight(),
                                )
                            }
                        }
                    }
                }
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
    displayedMonth: WidgetDay,
    day: WidgetDay,
    cellHeightDp: Float,
    fontScale: Float,
    cellModifier: GlanceModifier,
) {
    val events = eventsForWidgetDay(overview.events, day)
    val visibleEvents = events.take(monthVisibleEventCount(cellHeightDp, events.size, fontScale))
    val overflowCount = events.size - visibleEvents.size
    val isToday = day == today
    val inCurrentMonth = day.month == displayedMonth.month && day.year == displayedMonth.year
    Column(
            modifier = GlanceModifier
                .then(cellModifier)
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
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Spacer(
                        modifier = GlanceModifier
                            .width(2.dp)
                            .height(10.dp)
                            .background(ColorProvider(widgetEventColor(event.colorHex, appearance.accentColor))),
                    )
                    Spacer(modifier = GlanceModifier.width(2.dp))
                    Text(
                        text = shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7),
                        style = TextStyle(fontSize = scaledSp(9f, appearance), color = ColorProvider(widgetEventColor(event.colorHex, appearance.primaryTextColor))),
                        maxLines = 1,
                    )
                }
            }
        }
}

@Composable
private fun MonthBlankCell(cellModifier: GlanceModifier) {
    Spacer(modifier = cellModifier.fillMaxHeight())
}


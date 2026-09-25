package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.TextAlign
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

@Composable
internal fun CalendarWidgetDayCell(
    context: Context,
    overview: CalendarOverview,
    appearance: WidgetAppearance,
    today: WidgetDay,
    day: WidgetDay,
    cellHeightDp: Float,
    fontScale: Float,
    cellModifier: GlanceModifier,
) {
    val events = eventsForWidgetDay(overview.events, day)
    val visibleEvents = events.take(monthVisibleEventCount(cellHeightDp, events.size, fontScale).coerceAtMost(4))
    val overflowCount = events.size - visibleEvents.size
    val isToday = day == today
    Column(
            modifier = GlanceModifier
                .then(cellModifier)
                .fillMaxHeight()
                .background(if (isToday) appearance.todayColor else Color.Transparent)
                .clickable(actionStartActivity(createWidgetIntent(context, day)))
                .padding(2.dp),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth().height((16f * fontScale).dp)) {
                Text(
                    text = day.day.toString(),
                    style = TextStyle(
                        fontSize = scaledSp(12f, appearance),
                        fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                        color = ColorProvider(
                            when {
                                isToday -> appearance.todayTextColor
                                else -> appearance.primaryTextColor
                            },
                        ),
                        textAlign = TextAlign.Center,
                    ),
                    modifier = GlanceModifier.defaultWeight(),
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
                // 色マーカーと件名を1つのViewにして、予定の多い月でもGlanceの上限を超えない。
                Text(
                    text = "▎${shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7)}",
                    modifier = GlanceModifier.fillMaxWidth().height((12f * fontScale).dp),
                    style = TextStyle(fontSize = scaledSp(10f, appearance), color = ColorProvider(widgetEventColor(event.colorHex, appearance.primaryTextColor))),
                    maxLines = 1,
                )
            }
        }
}


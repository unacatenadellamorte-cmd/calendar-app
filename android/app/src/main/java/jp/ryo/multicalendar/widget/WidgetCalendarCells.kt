package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
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
    // 外側12dp・7列・セルとラベルの余白を引き、4文字と省略記号の幅を確保する。
    val titleWidthDp = ((LocalSize.current.width.value - 12f) / 7f - 6f).coerceAtLeast(1f)
    val systemFontScale = context.resources.configuration.fontScale.coerceAtLeast(0.5f)
    val events = eventsForWidgetDay(overview.events, day)
    val visibleEvents = events.take(monthVisibleEventCount(cellHeightDp, events.size, fontScale).coerceAtMost(4))
    val overflowCount = events.size - visibleEvents.size
    val isToday = day == today
    Column(
            modifier = GlanceModifier
                .then(cellModifier)
                .fillMaxHeight()
                .background(if (isToday) appearance.todayColor else Color.Transparent)
                .clickable(actionStartActivity(dayWidgetIntent(context, day)))
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
                    text = if (event.filledLabel) shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7)
                    else "▎${shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7)}",
                    modifier = GlanceModifier.fillMaxWidth().height((12f * fontScale).dp).let { modifier ->
                        if (event.filledLabel) modifier
                            .background(widgetEventColor(event.colorHex, appearance.primaryTextColor)).cornerRadius(2.dp)
                            .padding(horizontal = 1.dp)
                        else modifier
                    },
                    style = TextStyle(fontSize = minOf(
                        8f * appearance.appFontScale,
                        titleWidthDp / ((if (event.filledLabel) 5f else 6f) * systemFontScale),
                    ).sp, color = ColorProvider(
                        if (event.filledLabel) widgetFilledLabelTextColor(widgetEventColor(event.colorHex, appearance.primaryTextColor))
                        else widgetEventColor(event.colorHex, appearance.primaryTextColor),
                    )),
                    maxLines = 1,
                )
            }
        }
}

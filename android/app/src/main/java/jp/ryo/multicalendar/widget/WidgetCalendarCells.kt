package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
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
    connectedLabels: Boolean = false,
    previousVisibleIds: Set<String> = emptySet(),
    nextVisibleIds: Set<String> = emptySet(),
) {
    // 外側15dp・7列・セルとラベルの余白を引き、4文字と省略記号の幅を確保する(上限9sp)。
    val titleWidthDp = ((LocalSize.current.width.value - 15f) / 7f - 8f).coerceAtLeast(1f)
    val systemFontScale = context.resources.configuration.fontScale.coerceAtLeast(0.5f)
    val events = eventsForWidgetDay(overview.events, day)
    val visibleEvents = events.take(monthVisibleEventCount(cellHeightDp, events.size, fontScale).coerceAtMost(4))
    val overflowCount = events.size - visibleEvents.size
    val isToday = day == today
    Column(
            modifier = GlanceModifier
                .then(cellModifier)
                .fillMaxHeight()
                .widgetClickable(actionStartActivity(dayWidgetIntent(context, day)), appearance)
                .padding(horizontal = 2.dp, vertical = 1.dp),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth().height((16f * fontScale).dp)
                .background(if (isToday) appearance.todayColor else Color.Transparent).cornerRadius(6.dp)) {
                Text(
                    text = day.day.toString(),
                    style = TextStyle(
                        fontSize = scaledSp(13f, appearance),
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
                        style = TextStyle(fontSize = scaledSp(8f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor)),
                        maxLines = 1,
                        // 13spの日付行(16dp)の中へ収め、拡大した件数が下へはみ出さないようにする。
                        modifier = GlanceModifier.fillMaxHeight(),
                    )
                }
            }
            visibleEvents.forEach { event ->
                // 色マーカーは行背景へ描き、予定の多い月でもTextViewの数を増やさない。
                Text(
                    text = (if (event.filledLabel || connectedLabels) "" else "▎") + widgetContinuationTitle(event, day,
                        event.id.isNotBlank() && event.id in previousVisibleIds,
                        event.id.isNotBlank() && event.id in nextVisibleIds),
                    modifier = GlanceModifier.fillMaxWidth().height((12f * fontScale).dp).let { modifier ->
                        if (event.filledLabel && !connectedLabels) modifier
                            .background(widgetEventColor(event.colorHex, appearance.primaryTextColor)).cornerRadius(2.dp)
                            .padding(horizontal = 1.dp)
                        else if (!event.filledLabel && connectedLabels) modifier.padding(start = 5.dp)
                        else modifier.padding(start = 2.dp)
                    },
                    style = TextStyle(fontSize = minOf(
                        9f * appearance.appFontScale,
                        titleWidthDp / ((if (event.filledLabel) 5f else 6f) * systemFontScale),
                    ).sp, color = ColorProvider(
                        if (event.filledLabel) widgetFilledLabelTextColor(widgetEventColor(event.colorHex, appearance.primaryTextColor))
                        else appearance.primaryTextColor,
                    )),
                    maxLines = 1,
                )
            }
        }
}

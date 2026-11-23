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
    // 外側15dp・7列・セル(左右2dp)とラベル(左右1dp)の余白を引いた幅。文字サイズは widgetEventTitleSp で決める。
    val titleWidthDp = ((LocalSize.current.width.value - 15f) / 7f - 6f).coerceAtLeast(1f)
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
            Row(modifier = GlanceModifier.fillMaxWidth().height((WIDGET_DATE_ROW_DP * fontScale).dp)
                .background(if (isToday) appearance.todayColor else Color.Transparent).cornerRadius(6.dp)) {
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
                        style = TextStyle(fontSize = scaledSp(8f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.secondaryTextColor)),
                        maxLines = 1,
                        // 12spの日付行(WIDGET_DATE_ROW_DP)の中へ収め、拡大した件数が下へはみ出さないようにする。
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
                    modifier = GlanceModifier.fillMaxWidth().height((WIDGET_EVENT_LINE_DP * fontScale).dp).let { modifier ->
                        if (event.filledLabel && !connectedLabels) modifier
                            .background(widgetEventColor(event.colorHex, appearance.primaryTextColor)).cornerRadius(2.dp)
                            .padding(horizontal = 1.dp)
                        else if (!event.filledLabel && connectedLabels) modifier.padding(start = 5.dp)
                        else modifier.padding(start = 2.dp)
                    },
                    style = TextStyle(fontSize = widgetEventTitleSp(
                        if (!event.filledLabel && connectedLabels) titleWidthDp - 3f else titleWidthDp,
                        event.filledLabel, appearance.appFontScale, systemFontScale,
                    ).sp, fontWeight = FontWeight.Medium, color = ColorProvider(
                        if (event.filledLabel) widgetFilledLabelTextColor(widgetEventColor(event.colorHex, appearance.primaryTextColor))
                        else appearance.primaryTextColor,
                    )),
                    maxLines = 1,
                )
            }
        }
}

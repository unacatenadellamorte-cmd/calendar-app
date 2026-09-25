package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.datastore.preferences.core.Preferences
import androidx.glance.currentState
import androidx.compose.ui.unit.dp
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
    val preferences = remember(context) { context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE) }
    val snapshot = rememberWidgetSnapshot()
    val overview = snapshot.overview
    val appearance = snapshot.appearance
    val size = LocalSize.current
    val fontScale = context.resources.configuration.fontScale * appearance.appFontScale
    val today = todayWidgetDay()
    val monthOffset = currentState<Preferences>()[MONTH_OFFSET_STATE]
        ?: preferences.getInt(MONTH_OFFSET_KEY, 0)
    val displayedMonth = monthAnchor(today, monthOffset)
    val days = monthGridDays(displayedMonth.year, displayedMonth.month)
    // 曜日は必ず日曜始まりにする。月初の曜日を起点にすると、9月は火曜始まりになってしまう。
    val weekdayDays = weekWidgetDays(displayedMonth)
    val rows = days.chunked(7)
    val headerHeight = 28f * fontScale.coerceAtLeast(1f)
    val weekdayHeight = 16f * fontScale.coerceAtLeast(1f)
    val cellHeightDp = ((size.height.value - 12f - headerHeight - weekdayHeight) / rows.size)
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
                    Row(modifier = GlanceModifier.fillMaxWidth().height(cellHeightDp.dp)) {
                        row.forEach { day ->
                            if (day == null) {
                                MonthBlankCell(GlanceModifier.defaultWeight())
                            } else {
                                CalendarWidgetDayCell(
                                    context,
                                    overview,
                                    appearance,
                                    today,
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
private fun MonthBlankCell(cellModifier: GlanceModifier) {
    Spacer(modifier = cellModifier.fillMaxHeight())
}


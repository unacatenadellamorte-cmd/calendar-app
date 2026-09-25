package jp.ryo.multicalendar.widget

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Calendar

/** 選択日に重なる予定だけを、共有データの並び順のまま返す。 */
internal fun dayAgendaEvents(events: List<CalendarOverviewEvent>, selectedDay: WidgetDay): List<CalendarOverviewEvent> =
    // 日ウィジェットは選択日の予定だけを、共有データの並び順のまま表示する。
    eventsForWidgetDay(events, selectedDay)

internal fun agendaDateLabel(day: WidgetDay, today: WidgetDay, language: String): String {
    val lang = language.substringBefore('-')
    val relative = when (lang) {
        "en" -> "Today" to "Tomorrow"
        "zh" -> "今天" to "明天"
        "ko" -> "오늘" to "내일"
        "es" -> "Hoy" to "Mañana"
        "fr" -> "Aujourd’hui" to "Demain"
        else -> "今日" to "明日"
    }
    if (day == today) return relative.first
    if (day == addWidgetDays(today, 1)) return relative.second
    val date = if (day.year == today.year) "${day.month}/${day.day}" else "${day.year}/${day.month}/${day.day}"
    return "$date (${widgetWeekdayLabel(day, language)})"
}

internal fun agendaEventDetail(event: CalendarOverviewEvent, today: WidgetDay, language: String): String {
    val start = agendaDateLabel(event.startDate, today, language)
    // グリッドのendDateは排他的終了日の前日。時刻表示には実際の終了日を使う。
    val actualEnd = if (event.allDay) event.endDate else parseIsoUtc(event.endsAtIso)?.let { todayWidgetDay(it.time) } ?: event.endDate
    val date = if (event.startDate == actualEnd) start else "$start – ${agendaDateLabel(actualEnd, today, language)}"
    val time = if (event.allDay) {
        when (language.substringBefore('-')) {
            "en" -> "All-day"
            "zh" -> "全天"
            "ko" -> "종일"
            "es" -> "Todo el día"
            "fr" -> "Toute la journée"
            else -> "終日"
        }
    } else {
        val formatter = SimpleDateFormat("H:mm", Locale.getDefault())
        val from = parseIsoUtc(event.startsAtIso)?.let { formatter.format(it) }.orEmpty()
        val until = parseIsoUtc(event.endsAtIso)?.let { formatter.format(it) }
        if (until == null) from else "$from–$until"
    }
    return if (time.isBlank()) date else "$date ・ $time"
}

internal fun agendaMonthLabel(day: WidgetDay, language: String): String {
    val calendar = Calendar.getInstance().apply { clear(); set(day.year, day.month - 1, 1, 12, 0, 0) }
    return SimpleDateFormat("LLLL", Locale.forLanguageTag(language)).format(calendar.time)
}

@Composable
internal fun DayAgendaContent() {
    val context = LocalContext.current
    val snapshot = rememberWidgetSnapshot()
    val overview = snapshot.overview
    val appearance = snapshot.appearance
    val today = todayWidgetDay()
    val dayOffset = widgetDateOffset(DAY_OFFSET_STATE)
    val selectedDay = addWidgetDays(today, dayOffset)
    val events = remember(overview, selectedDay) { dayAgendaEvents(overview.events, selectedDay) }
    val size = LocalSize.current
    if (size.height.value < 100f) {
        CompactDayAgenda(events.firstOrNull(), selectedDay, appearance, overview.language, today)
        return
    }
    val scale = context.resources.configuration.fontScale * appearance.appFontScale
    val compact = size.height.value < 160f * scale
    val railAppearance = appearance.copy(appFontScale = appearance.appFontScale *
        ((size.height.value - 12f) / ((if (compact) 108f else 154f) * scale)).coerceAtMost(1f))
    val railWidth = (size.width.value * 0.25f).coerceIn(56f, 100f)
    Row(modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor.copy(alpha = 0.94f)).padding(horizontal = 10.dp, vertical = 6.dp)) {
        Column(modifier = GlanceModifier.width(railWidth.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(text = "▲", style = TextStyle(fontSize = scaledSp(13f, railAppearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionRunCallback<DayPreviousAction>()))
                Text(text = "▼", style = TextStyle(fontSize = scaledSp(13f, railAppearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.accentColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionRunCallback<DayNextAction>()))
            }
            Text(
                text = widgetWeekdayLabel(selectedDay, overview.language) + if (overview.language == "ja") "曜日" else "",
                style = TextStyle(fontSize = scaledSp(13f, railAppearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor), textAlign = TextAlign.Center),
                maxLines = 1,
            )
            Text(text = if (compact) if (selectedDay.year != today.year) "${selectedDay.year}/${selectedDay.month}/${selectedDay.day}" else "${selectedDay.month}/${selectedDay.day}" else selectedDay.day.toString(), style = TextStyle(fontSize = scaledSp(if (compact) { if (selectedDay.year != today.year) 11f else 22f } else 38f, railAppearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor)))
            if (!compact) {
                Text(text = if (selectedDay.year != today.year) "${selectedDay.year}/${selectedDay.month}" else agendaMonthLabel(selectedDay, overview.language), style = TextStyle(fontSize = scaledSp(15f, railAppearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor)))
                Spacer(modifier = GlanceModifier.height(4.dp))
            }
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(text = "⚙", style = TextStyle(fontSize = scaledSp(if (compact) 20f else 25f, railAppearance), color = ColorProvider(appearance.secondaryTextColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(widgetDeepLinkIntent(context, "settings", ""))))
                Text(text = "＋", style = TextStyle(fontSize = scaledSp(if (compact) 20f else 22f, railAppearance), color = ColorProvider(appearance.accentColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(createWidgetIntent(context, selectedDay))))
            }
        }
        Spacer(modifier = GlanceModifier.width(12.dp))
        if (events.isEmpty()) {
            Text(text = if (overview.language == "ja") "予定はありません" else "—", style = TextStyle(fontSize = scaledSp(14f, appearance), color = ColorProvider(appearance.secondaryTextColor)), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(dayWidgetIntent(context, selectedDay))))
        } else {
            LazyColumn(modifier = GlanceModifier.defaultWeight().fillMaxHeight()) {
                items(events) { event ->
                    Row(modifier = GlanceModifier.fillMaxWidth().padding(bottom = 6.dp).clickable(actionStartActivity(if (event.id.isBlank()) dayWidgetIntent(context, event.startDate) else widgetDeepLinkIntent(context, "event", event.id)))) {
                        Spacer(modifier = GlanceModifier.width(4.dp).height((42f * scale).dp).background(widgetEventColor(event.colorHex, appearance.accentColor)))
                        Spacer(modifier = GlanceModifier.width(8.dp))
                        Column(modifier = GlanceModifier.defaultWeight()) {
                            Text(text = event.title.ifBlank { event.calendarName }, style = TextStyle(fontSize = scaledSp(17f, appearance), color = ColorProvider(appearance.primaryTextColor)), maxLines = 1)
                            Text(text = agendaEventDetail(event, today, overview.language), style = TextStyle(fontSize = scaledSp(12f, appearance), color = ColorProvider(appearance.secondaryTextColor)), maxLines = 2)
                        }
                    }
                }
            }
        }
    }
}

/** 旧版で配置された高さ40dpのウィジェットも、リサイズするまでは操作可能に保つ。 */
@Composable
private fun CompactDayAgenda(event: CalendarOverviewEvent?, selectedDay: WidgetDay, appearance: WidgetAppearance, language: String, today: WidgetDay) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor).padding(3.dp)) {
        Column(modifier = GlanceModifier.width(58.dp)) {
            Row {
                Text(text = "▲", style = TextStyle(fontSize = scaledSp(11f, appearance), color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.defaultWeight().clickable(actionRunCallback<DayPreviousAction>()))
                Text(text = "▼", style = TextStyle(fontSize = scaledSp(11f, appearance), color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.defaultWeight().clickable(actionRunCallback<DayNextAction>()))
            }
            Text(text = if (selectedDay.year != today.year) "${selectedDay.year}/${selectedDay.month}/${selectedDay.day}" else "${selectedDay.month}/${selectedDay.day} ⚙", style = TextStyle(fontSize = scaledSp(11f, appearance), color = ColorProvider(appearance.primaryTextColor)), modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivity(widgetDeepLinkIntent(context, "settings", ""))), maxLines = 1)
        }
        Column(modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(if (event?.id.isNullOrBlank()) dayWidgetIntent(context, selectedDay) else widgetDeepLinkIntent(context, "event", event!!.id)))) {
            Text(text = event?.title?.ifBlank { event.calendarName } ?: "—", style = TextStyle(fontSize = scaledSp(12f, appearance), color = ColorProvider(widgetEventColor(event?.colorHex.orEmpty(), appearance.primaryTextColor))), maxLines = 1)
            if (event != null) Text(text = agendaEventDetail(event, today, language), style = TextStyle(fontSize = scaledSp(10f, appearance), color = ColorProvider(appearance.secondaryTextColor)), maxLines = 1)
        }
        Text(text = "＋", style = TextStyle(fontSize = scaledSp(18f, appearance), color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, selectedDay))))
    }
}

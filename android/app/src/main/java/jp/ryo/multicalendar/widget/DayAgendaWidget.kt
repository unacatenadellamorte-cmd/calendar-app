package jp.ryo.multicalendar.widget

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
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

/** 日付だけで安定ソートし、同日内のアプリ設定順は共有データのまま保つ。 */
internal fun dayAgendaEvents(events: List<CalendarOverviewEvent>, today: WidgetDay): List<CalendarOverviewEvent> =
    events.filter { it.endDate >= today }.sortedBy { maxOf(it.startDate, today) }

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
    val events = remember(overview, today) { dayAgendaEvents(overview.events, today) }
    val size = LocalSize.current
    if (size.height.value < 100f) {
        CompactDayAgenda(events.firstOrNull(), today, appearance, overview.language)
        return
    }
    val compact = size.height.value < 160f
    val scale = context.resources.configuration.fontScale * appearance.appFontScale
    val railWidth = (size.width.value * 0.25f).coerceIn(56f, 100f)
    Row(modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor.copy(alpha = 0.94f)).padding(10.dp)) {
        Column(modifier = GlanceModifier.width(railWidth.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = widgetWeekdayLabel(today, overview.language) + if (overview.language == "ja") "曜日" else "",
                style = TextStyle(fontSize = scaledSp(13f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor), textAlign = TextAlign.Center),
                maxLines = 1,
            )
            Text(text = if (compact) "${today.month}/${today.day}" else today.day.toString(), style = TextStyle(fontSize = scaledSp(if (compact) 22f else 38f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor)))
            if (!compact) {
                Text(text = agendaMonthLabel(today, overview.language), style = TextStyle(fontSize = scaledSp(15f, appearance), fontWeight = FontWeight.Bold, color = ColorProvider(appearance.primaryTextColor)))
                Spacer(modifier = GlanceModifier.height(8.dp))
            }
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(text = "⚙", style = TextStyle(fontSize = scaledSp(if (compact) 20f else 25f, appearance), color = ColorProvider(appearance.secondaryTextColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(widgetDeepLinkIntent(context, "settings", ""))))
                Text(text = "＋", style = TextStyle(fontSize = scaledSp(if (compact) 20f else 22f, appearance), color = ColorProvider(appearance.accentColor), textAlign = TextAlign.Center), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(createWidgetIntent(context, today))))
            }
        }
        Spacer(modifier = GlanceModifier.width(12.dp))
        if (events.isEmpty()) {
            Text(text = if (overview.language == "ja") "この後の予定はありません" else "—", style = TextStyle(fontSize = scaledSp(14f, appearance), color = ColorProvider(appearance.secondaryTextColor)), modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(dayWidgetIntent(context, today))))
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
private fun CompactDayAgenda(event: CalendarOverviewEvent?, today: WidgetDay, appearance: WidgetAppearance, language: String) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxSize().background(appearance.backgroundColor).padding(3.dp)) {
        Text(text = "${today.month}/${today.day} ⚙", style = TextStyle(fontSize = scaledSp(12f, appearance), color = ColorProvider(appearance.primaryTextColor)), modifier = GlanceModifier.width(52.dp).clickable(actionStartActivity(widgetDeepLinkIntent(context, "settings", ""))), maxLines = 1)
        Column(modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(if (event?.id.isNullOrBlank()) dayWidgetIntent(context, today) else widgetDeepLinkIntent(context, "event", event!!.id)))) {
            Text(text = event?.title?.ifBlank { event.calendarName } ?: "—", style = TextStyle(fontSize = scaledSp(12f, appearance), color = ColorProvider(widgetEventColor(event?.colorHex.orEmpty(), appearance.primaryTextColor))), maxLines = 1)
            if (event != null) Text(text = agendaEventDetail(event, today, language), style = TextStyle(fontSize = scaledSp(10f, appearance), color = ColorProvider(appearance.secondaryTextColor)), maxLines = 1)
        }
        Text(text = "＋", style = TextStyle(fontSize = scaledSp(18f, appearance), color = ColorProvider(appearance.accentColor)), modifier = GlanceModifier.clickable(actionStartActivity(createWidgetIntent(context, today))))
    }
}

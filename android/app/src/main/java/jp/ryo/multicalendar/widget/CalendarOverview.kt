package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import jp.ryo.multicalendar.MainActivity
import org.json.JSONArray
import java.util.Calendar
import java.util.Locale
import kotlin.math.floor

/** JS側が保存する、週/月表示用の共有データ。日付はローカル日付の両端を含む。 */
internal const val CALENDAR_OVERVIEW_KEY = "calendarOverview"

internal data class WidgetDay(val year: Int, val month: Int, val day: Int) : Comparable<WidgetDay> {
    override fun compareTo(other: WidgetDay): Int {
        val yearOrder = year.compareTo(other.year)
        if (yearOrder != 0) return yearOrder
        val monthOrder = month.compareTo(other.month)
        return if (monthOrder != 0) monthOrder else day.compareTo(other.day)
    }
    fun toKey(): String = "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
}

internal data class CalendarOverviewEvent(
    val id: String,
    val title: String,
    val calendarName: String,
    val colorHex: String,
    val startDate: WidgetDay,
    val endDate: WidgetDay,
    val startsAtIso: String,
    val allDay: Boolean,
    val endsAtIso: String = "",
    val filledLabel: Boolean = false,
)

internal data class CalendarOverview(
    val language: String,
    val events: List<CalendarOverviewEvent>,
)

/** 日付だけの検証にフォーマッターやタイムゾーン変換を使わない。 */
internal fun parseWidgetDay(value: String): WidgetDay? {
    if (value.length != 10 || value[4] != '-' || value[7] != '-') return null
    if (value.indices.any { it != 4 && it != 7 && value[it] !in '0'..'9' }) return null
    val year = value.substring(0, 4).toInt()
    val month = value.substring(5, 7).toInt()
    val day = value.substring(8, 10).toInt()
    if (year !in 1..9999 || month !in 1..12) return null
    val daysInMonth = when (month) {
        2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }
    return if (day in 1..daysInMonth) WidgetDay(year, month, day) else null
}

internal fun todayWidgetDay(now: Long = System.currentTimeMillis()): WidgetDay {
    val calendar = Calendar.getInstance().apply { timeInMillis = now }
    return WidgetDay(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH))
}

internal fun addWidgetDays(day: WidgetDay, amount: Int): WidgetDay {
    val calendar = Calendar.getInstance().apply {
        clear()
        set(day.year, day.month - 1, day.day, 12, 0, 0)
        add(Calendar.DAY_OF_MONTH, amount)
    }
    return WidgetDay(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH))
}

/** 日曜始まりの週。Calendar.DAY_OF_WEEK は日曜=1なので、0始まりへ変換する。 */
internal fun weekWidgetDays(today: WidgetDay): List<WidgetDay> {
    val calendar = Calendar.getInstance().apply {
        clear()
        set(today.year, today.month - 1, today.day, 12, 0, 0)
    }
    val offset = calendar.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
    val first = addWidgetDays(today, -offset)
    return (0..6).map { addWidgetDays(first, it) }
}

/** 月初の曜日から必要な5週または6週だけを返す(常に最大6週)。 */
internal fun monthWidgetDays(today: WidgetDay): List<WidgetDay> {
    val first = WidgetDay(today.year, today.month, 1)
    val calendar = Calendar.getInstance().apply {
        clear()
        set(first.year, first.month - 1, first.day, 12, 0, 0)
    }
    val offset = calendar.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
    val daysInMonth = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
    val count = if (offset + daysInMonth <= 35) 35 else 42
    val gridStart = addWidgetDays(first, -offset)
    return (0 until count).map { addWidgetDays(gridStart, it) }
}

/** 指定月を7列で表示するセル。前後月は空セルにして、対象月の日だけを表示する。 */
internal fun monthGridDays(year: Int, month: Int): List<WidgetDay?> {
    val first = WidgetDay(year, month, 1)
    val calendar = Calendar.getInstance().apply {
        clear()
        set(year, month - 1, 1, 12, 0, 0)
    }
    val offset = calendar.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
    val daysInMonth = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
    val cellCount = if (offset + daysInMonth <= 35) 35 else 42
    return (0 until cellCount).map { index ->
        if (index in offset until (offset + daysInMonth)) addWidgetDays(first, index - offset) else null
    }
}

/** 今日を基準に、月移動分だけずらした月の1日を返す。 */
internal fun monthAnchor(today: WidgetDay, offset: Int): WidgetDay {
    val calendar = Calendar.getInstance().apply {
        clear()
        set(today.year, today.month - 1, 1, 12, 0, 0)
        add(Calendar.MONTH, offset)
    }
    return WidgetDay(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1, 1)
}

internal fun eventsForWidgetDay(events: List<CalendarOverviewEvent>, day: WidgetDay): List<CalendarOverviewEvent> =
    events.filter { it.startDate <= day && day <= it.endDate }

private var cachedOverviewRaw: String? = null
private var cachedOverview = CalendarOverview("ja", emptyList())

/** 同じ共有JSONは複数ウィジェット・再起動した描画セッションでも再解析しない。 */
@Synchronized
internal fun readCalendarOverview(context: Context): CalendarOverview {
    val raw = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        .getString(CALENDAR_OVERVIEW_KEY, null) ?: return CalendarOverview("ja", emptyList())
    if (raw == cachedOverviewRaw) return cachedOverview
    val overview = try {
        val root = org.json.JSONObject(raw)
        val language = root.optString("language", "ja")
        val array = root.optJSONArray("events") ?: JSONArray()
        val events = buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val start = parseWidgetDay(item.optString("startDate")) ?: continue
                val end = parseWidgetDay(item.optString("endDate")) ?: start
                val normalizedEnd = if (end < start) start else end
                add(CalendarOverviewEvent(
                    id = item.optString("id", ""),
                    title = item.optString("title", ""),
                    calendarName = item.optString("calendarName", ""),
                    colorHex = item.optString("colorHex", "#7A7A7A"),
                    startDate = start,
                    endDate = normalizedEnd,
                    startsAtIso = item.optString("startsAtIso", ""),
                    allDay = item.optBoolean("allDay", false),
                    endsAtIso = item.optString("endsAtIso", ""),
                    filledLabel = item.optBoolean("filledLabel", false),
                ))
            }
        }
        CalendarOverview(language, events)
    } catch (_: Exception) {
        CalendarOverview("ja", emptyList())
    }
    cachedOverviewRaw = raw
    cachedOverview = overview
    return overview
}

internal fun widgetText(language: String, key: String): String {
    val normalized = language.lowercase(Locale.US).substringBefore('-')
    return when (key) {
        "add" -> when (normalized) {
            "en" -> "Add"
            "zh" -> "添加"
            "ko" -> "추가"
            "es" -> "Añadir"
            "fr" -> "Ajouter"
            else -> "追加"
        }
        "week" -> when (normalized) {
            "en" -> "Week"
            "zh" -> "周"
            "ko" -> "주"
            "es" -> "Semana"
            "fr" -> "Semaine"
            else -> "週"
        }
        "month" -> when (normalized) {
            "en" -> "Month"
            "zh" -> "月"
            "ko" -> "월"
            "es" -> "Mes"
            "fr" -> "Mois"
            else -> "月"
        }
        else -> key
    }
}

/** 月グリッドのセル高。外側余白・見出し・曜日行を除いた利用可能領域を返す。 */
internal fun monthCellHeightDp(totalHeightDp: Float, rowCount: Int, fontScale: Float = 1f): Float {
    val scale = fontScale.coerceAtLeast(1f)
    return ((totalHeightDp - 12f - 24f * scale - 20f * scale) / rowCount.coerceAtLeast(1)).coerceAtLeast(0f)
}

/** 日付行と上下余白を除き、セル内に収まるテキスト行数を求める。 */
internal fun monthEventLineCapacity(cellHeightDp: Float, fontScale: Float = 1f): Int {
    val scale = fontScale.coerceAtLeast(0.5f)
    // 日付行・上下余白を含む保守的な12dp行高。本文は10spで描画する。
    return floor((cellHeightDp - 4f - 16f * scale) / (12f * scale)).toInt().coerceAtLeast(0)
}

/** 超過件数は日付行に表示するため、イベント行の実容量までタイトルを描く。 */
internal fun monthVisibleEventCount(cellHeightDp: Float, eventCount: Int, fontScale: Float = 1f): Int =
    eventCount.coerceAtLeast(0).coerceAtMost(monthEventLineCapacity(cellHeightDp, fontScale))

internal fun widgetOverflowCountText(count: Int): String = "+$count"

internal fun widgetWeekdayLabel(day: WidgetDay, language: String): String {
    val labels = when (language.lowercase(Locale.US).substringBefore('-')) {
        "en" -> arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
        "zh" -> arrayOf("日", "一", "二", "三", "四", "五", "六")
        "ko" -> arrayOf("일", "월", "화", "수", "목", "금", "토")
        "es" -> arrayOf("dom", "lun", "mar", "mié", "jue", "vie", "sáb")
        "fr" -> arrayOf("dim", "lun", "mar", "mer", "jeu", "ven", "sam")
        else -> arrayOf("日", "月", "火", "水", "木", "金", "土")
    }
    val calendar = Calendar.getInstance().apply {
        clear()
        set(day.year, day.month - 1, day.day, 12, 0, 0)
    }
    return labels[calendar.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY]
}

/** すべてのタップは explicit intent でMainActivityに限定する。 */
internal fun widgetDeepLinkIntent(context: Context, path: String, value: String): Intent =
    Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("calendar-app://$path/${Uri.encode(value)}")
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

internal fun createWidgetIntent(context: Context, day: WidgetDay): Intent =
    widgetDeepLinkIntent(context, "create", day.toKey())

internal fun dayWidgetIntent(context: Context, day: WidgetDay): Intent =
    widgetDeepLinkIntent(context, "day", day.toKey())

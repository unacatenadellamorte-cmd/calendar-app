package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import jp.ryo.multicalendar.MainActivity
import org.json.JSONArray
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.floor

/** JS側が保存する、週/月表示用の共有データ。日付はローカル日付の両端を含む。 */
internal const val CALENDAR_OVERVIEW_KEY = "calendarOverview"

internal data class WidgetDay(val year: Int, val month: Int, val day: Int) : Comparable<WidgetDay> {
    override fun compareTo(other: WidgetDay): Int = toKey().compareTo(other.toKey())
    fun toKey(): String = String.format(Locale.US, "%04d-%02d-%02d", year, month, day)
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
)

internal data class CalendarOverview(
    val language: String,
    val events: List<CalendarOverviewEvent>,
)

internal fun parseWidgetDay(value: String): WidgetDay? {
    if (!value.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return null
    return try {
        val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            isLenient = false
        }.parse(value) ?: return null
        val calendar = Calendar.getInstance().apply { time = parsed }
        // SimpleDateFormatのロケール日付はタイムゾーン境界の影響を受けないよう、
        // 入力文字列の各フィールドを検証してから値を返す。
        val result = WidgetDay(value.substring(0, 4).toInt(), value.substring(5, 7).toInt(), value.substring(8, 10).toInt())
        if (calendar.get(Calendar.YEAR) != result.year ||
            calendar.get(Calendar.MONTH) + 1 != result.month ||
            calendar.get(Calendar.DAY_OF_MONTH) != result.day
        ) null else result
    } catch (_: ParseException) {
        null
    } catch (_: NumberFormatException) {
        null
    }
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

internal fun eventsForWidgetDay(events: List<CalendarOverviewEvent>, day: WidgetDay): List<CalendarOverviewEvent> =
    events.filter { it.startDate <= day && day <= it.endDate }

/** 共有JSONが空/壊れていても呼び出し側は空カレンダーを描画できる。 */
internal fun readCalendarOverview(context: Context): CalendarOverview {
    val raw = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        .getString(CALENDAR_OVERVIEW_KEY, null) ?: return CalendarOverview("ja", emptyList())
    return try {
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
                ))
            }
        }
        CalendarOverview(language, events)
    } catch (_: Exception) {
        CalendarOverview("ja", emptyList())
    }
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
    return floor((cellHeightDp - 16f * scale) / (12f * scale)).toInt().coerceAtLeast(0)
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

package jp.ryo.multicalendar.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CalendarOverviewTest {
    @Test
    fun `週は日曜始まりで月境界をまたぐ`() {
        val days = weekWidgetDays(WidgetDay(2026, 9, 16)) // 水曜
        assertEquals("2026-09-13", days.first().toKey())
        assertEquals("2026-09-19", days.last().toKey())
    }

    @Test
    fun `月グリッドはうるう年2月を35セルに収める`() {
        val days = monthWidgetDays(WidgetDay(2028, 2, 10))
        assertEquals(35, days.size)
        assertEquals("2028-01-30", days.first().toKey())
        assertEquals("2028-03-04", days.last().toKey())
    }

    @Test
    fun `月初曜日と日数で6週へ拡張する`() {
        val days = monthWidgetDays(WidgetDay(2026, 8, 10))
        assertEquals(42, days.size)
        assertEquals("2026-07-26", days.first().toKey())
        assertEquals("2026-09-05", days.last().toKey())
    }

    @Test
    fun `不正日付は空データ扱いにできる`() {
        assertNull(parseWidgetDay("2026-02-29"))
        assertNull(parseWidgetDay("2026-1-01"))
        assertEquals("2026-02-28", parseWidgetDay("2026-02-28")?.toKey())
    }

    @Test
    fun `複数日予定は両端を含めて各日に含まれる`() {
        val event = CalendarOverviewEvent(
            id = "e1", title = "出張", calendarName = "仕事", colorHex = "#000000",
            startDate = WidgetDay(2026, 9, 16), endDate = WidgetDay(2026, 9, 18),
            startsAtIso = "", allDay = true,
        )
        assertTrue(eventsForWidgetDay(listOf(event), WidgetDay(2026, 9, 16)).isNotEmpty())
        assertTrue(eventsForWidgetDay(listOf(event), WidgetDay(2026, 9, 17)).isNotEmpty())
        assertTrue(eventsForWidgetDay(listOf(event), WidgetDay(2026, 9, 18)).isNotEmpty())
        assertTrue(eventsForWidgetDay(listOf(event), WidgetDay(2026, 9, 19)).isEmpty())
    }

    @Test
    fun `短いタイトルは最大長を超えない`() {
        assertEquals("会議", shortWidgetTitle("会議", 7))
        assertEquals("123456…", shortWidgetTitle("123456789", 7))
    }
}

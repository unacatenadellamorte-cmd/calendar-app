package jp.ryo.multicalendar.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CalendarOverviewTest {
    @Test
    fun `週は日曜始まりで月境界をまたぐ`() {
        val days = weekWidgetDays(WidgetDay(2026, 9, 16)) // 水曜
        assertEquals(7, days.size)
        assertEquals("2026-09-13", days.first().toKey())
        assertEquals("2026-09-19", days.last().toKey())
        assertEquals(listOf("日", "月", "火", "水", "木", "金", "土"), days.map { widgetWeekdayLabel(it, "ja") })
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
    fun `表示月グリッドは前後月の日付を空セルにして月末までを収める`() {
        val days = monthGridDays(2026, 8)
        assertEquals(42, days.size)
        assertTrue(days.take(6).all { it == null })
        assertEquals("2026-08-01", days[6]?.toKey())
        assertEquals("2026-08-31", days[36]?.toKey())
        assertTrue(days.drop(37).all { it == null })
    }

    @Test
    fun `月移動は年またぎして1日を返す`() {
        assertEquals("2027-01-01", monthAnchor(WidgetDay(2026, 12, 20), 1).toKey())
        assertEquals("2025-12-01", monthAnchor(WidgetDay(2026, 1, 20), -1).toKey())
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
    fun `月セルは利用可能高に応じて超過行を予約する`() {
        val fiveRows = monthCellHeightDp(280f, 5)
        val sixRows = monthCellHeightDp(280f, 6)
        val tallSixRows = monthCellHeightDp(420f, 6)
        assertEquals(2, monthVisibleEventCount(fiveRows, 3))
        assertEquals(2, monthVisibleEventCount(fiveRows, 4))
        assertEquals(1, monthVisibleEventCount(sixRows, 3))
        assertTrue(monthVisibleEventCount(tallSixRows, 3) >= 2)
        assertEquals(0, monthEventLineCapacity(10f))
        assertEquals(0, monthEventLineCapacity(sixRows, 2f))
        assertEquals("+2", widgetOverflowCountText(2))
    }

    @Test
    fun `短いタイトルは最大長を超えない`() {
        assertEquals("会議", shortWidgetTitle("会議", 7))
        assertEquals("123456…", shortWidgetTitle("123456789", 7))
    }
}

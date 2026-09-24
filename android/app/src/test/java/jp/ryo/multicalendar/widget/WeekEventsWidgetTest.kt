package jp.ryo.multicalendar.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class WeekEventsWidgetTest {
    @Test
    fun `複数予定は区切り記号ではなく改行で表示用文字列を作る`() {
        val day = WidgetDay(2026, 9, 24)
        val events = listOf(
            CalendarOverviewEvent("1", "会議", "仕事", "#000000", day, day, "", true),
            CalendarOverviewEvent("2", "買い物", "生活", "#000000", day, day, "", true),
        )

        assertEquals("会議\n買い物", weekEventSummary(events))
    }

    @Test
    fun `タイトルが空ならカレンダー名を改行で表示する`() {
        val day = WidgetDay(2026, 9, 24)
        val events = listOf(
            CalendarOverviewEvent("1", "", "仕事", "#000000", day, day, "", true),
            CalendarOverviewEvent("2", "予定", "生活", "#000000", day, day, "", true),
        )

        assertEquals("仕事\n予定", weekEventSummary(events))
    }
}

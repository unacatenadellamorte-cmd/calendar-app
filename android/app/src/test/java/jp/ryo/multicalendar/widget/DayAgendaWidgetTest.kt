package jp.ryo.multicalendar.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class DayAgendaWidgetTest {
    private val today = WidgetDay(2026, 9, 25)
    private fun event(id: String, start: WidgetDay = today, end: WidgetDay = start) =
        CalendarOverviewEvent(id, id, "予定", "#0072B2", start, end, "", true)

    @Test fun agendaShowsOnlySelectedDateAndPreservesPayloadOrder() {
        val tomorrow = addWidgetDays(today, 1)
        val yesterday = addWidgetDays(today, -1)
        val events = listOf(event("明日先", tomorrow), event("今日先"), event("過去", yesterday), event("継続", yesterday, tomorrow), event("今日後"), event("明日後", tomorrow))
        assertEquals(listOf("今日先", "継続", "今日後"), dayAgendaEvents(events, today).map { it.id })
        assertEquals(listOf("明日先", "継続", "明日後"), dayAgendaEvents(events, tomorrow).map { it.id })
    }

    @Test fun agendaExcludesEventsOutsideSelectedDate() {
        val yesterday = addWidgetDays(today, -1)
        val tomorrow = addWidgetDays(today, 1)
        val events = listOf(event("過去", yesterday), event("未来", tomorrow))
        assertEquals(emptyList<CalendarOverviewEvent>(), dayAgendaEvents(events, today))
    }

    @Test fun detailsContainDateRangeAndAllDayLabel() {
        assertEquals("今日 ・ 終日", agendaEventDetail(event("予定"), today, "ja"))
        assertEquals("今日 – 明日 ・ 終日", agendaEventDetail(event("連日", today, addWidgetDays(today, 1)), today, "ja"))
        assertEquals("2027/1/1 (金)", agendaDateLabel(WidgetDay(2027, 1, 1), today, "ja"))
    }
    @Test fun midnightEndUsesActualEndDate() {
        val zone = java.util.TimeZone.getDefault()
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Tokyo"))
            val timed = event("深夜終了").copy(allDay = false, startsAtIso = "2026-09-25T00:00:00.000Z", endsAtIso = "2026-09-25T15:00:00.000Z")
            assertEquals("今日 – 明日 ・ 9:00–0:00", agendaEventDetail(timed, today, "ja"))
            assertEquals("September", agendaMonthLabel(today, "en"))
            assertEquals("9月", agendaMonthLabel(today, "ja"))
        } finally { java.util.TimeZone.setDefault(zone) }
    }
}

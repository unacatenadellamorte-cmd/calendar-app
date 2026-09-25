package jp.ryo.multicalendar.widget

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetAppearanceTest {
    @Test fun `中間明度でも読める黒文字へ補正する`() {
        assertEquals(Color.Black, widgetFilledLabelTextColor(Color(0xFF7B7B7B)))
    }

    @Test fun `自作ラベルは明色背景に濃紺文字を選ぶ`() {
        assertEquals(Color(0xFF111827), widgetFilledLabelTextColor(Color(0xFFFDE68A)))
    }

    @Test fun `自作ラベルは暗色背景に白文字を選ぶ`() {
        assertEquals(Color.White, widgetFilledLabelTextColor(Color(0xFF1D4ED8)))
    }

    @Test fun `外部予定はfilledLabel既定値falseを維持する`() {
        val event = CalendarOverviewEvent(
            id = "external", title = "予定", calendarName = "カレンダー", colorHex = "#2563EB",
            startDate = WidgetDay(2026, 9, 25), endDate = WidgetDay(2026, 9, 25),
            startsAtIso = "", allDay = true,
        )
        assertEquals(false, event.filledLabel)
        assertEquals(true, event.copy(filledLabel = true).filledLabel)
    }
}

package jp.ryo.multicalendar.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetMetalThemeTest {
    @Test fun `ゴールドとシルバーだけが金属、既存テーマと不明値は従来のガラス`() {
        assertEquals(WidgetMetal.GOLD, widgetMetalFor("gold"))
        assertEquals(WidgetMetal.SILVER, widgetMetalFor("silver"))
        listOf("system", "light", "dark", "sakura", "leaf", "ocean", "lavender", "glass", "", "platinum").forEach {
            assertEquals(it, WidgetMetal.NONE, widgetMetalFor(it))
        }
    }

    @Test fun `旧形式の外観は金属なし`() {
        assertEquals(WidgetMetal.NONE, WidgetAppearance().metal)
        assertNull(widgetMetalTones(WidgetMetal.NONE))
    }

    @Test fun `ゴールドは暖色の明暗、シルバーは無彩色の明暗`() {
        val gold = widgetMetalTones(WidgetMetal.GOLD)!!
        assertTrue(gold.body.red > gold.body.blue + 0.3f)
        assertTrue(gold.deep.red < 0.4f && gold.highlight.red > 0.95f)
        val silver = widgetMetalTones(WidgetMetal.SILVER)!!
        listOf(silver.highlight, silver.body, silver.deep).forEach {
            assertTrue(kotlin.math.abs(it.red - it.blue) < 0.06f)
        }
        assertTrue(silver.deep.red < 0.3f && silver.highlight.red > 0.95f)
    }
}

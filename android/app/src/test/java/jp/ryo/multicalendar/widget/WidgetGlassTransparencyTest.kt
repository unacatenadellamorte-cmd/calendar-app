package jp.ryo.multicalendar.widget

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetGlassTransparencyTest {
    @Test fun `保存値0から100を0から1へ変換する`() {
        assertEquals(0f, parseWidgetGlassTransparency(0), 0f)
        assertEquals(0.5f, parseWidgetGlassTransparency(50), 0.0001f)
        assertEquals(1f, parseWidgetGlassTransparency(100.0), 0f)
    }

    @Test fun `欠損や不正値は既定値、範囲外は端へ丸める`() {
        assertEquals(DEFAULT_WIDGET_GLASS_TRANSPARENCY, parseWidgetGlassTransparency(null), 0f)
        assertEquals(DEFAULT_WIDGET_GLASS_TRANSPARENCY, parseWidgetGlassTransparency("70"), 0f)
        assertEquals(DEFAULT_WIDGET_GLASS_TRANSPARENCY, parseWidgetGlassTransparency(Double.NaN), 0f)
        assertEquals(0f, parseWidgetGlassTransparency(-20), 0f)
        assertEquals(1f, parseWidgetGlassTransparency(250), 0f)
    }

    @Test fun `外観未受信の旧データは透過度に関係なく従来の面を保つ`() {
        val appearance = WidgetAppearance(glass = false, glassTransparency = 1f)
        assertArrayEquals(floatArrayOf(0.96f, 0.94f, 0.96f), widgetGlassFaceAlphas(appearance), 0f)
        assertEquals(0.10f, widgetGlassBottomShade(appearance), 0f)
    }

    @Test fun `ガラスは0で不透明、100でも文字の保護面を30パーセント残す`() {
        val opaque = widgetGlassFaceAlphas(WidgetAppearance(glass = true, glassTransparency = 0f))
        assertArrayEquals(floatArrayOf(1f, 1f, 1f), opaque, 0.0001f)
        val clear = widgetGlassFaceAlphas(WidgetAppearance(glass = true, glassTransparency = 1f))
        assertEquals(0.3f, clear[1], 0.0001f)
        // 光の当たる左上をわずかに厚く残し、面の向きを伝える。
        assertEquals(0.35f, clear[0], 0.0001f)
        val defaults = widgetGlassFaceAlphas(WidgetAppearance(glass = true))
        assertEquals(0.755f, defaults[1], 0.0001f)
    }

    @Test fun `透明度が上がると下側の陰影を弱める`() {
        val shade0 = widgetGlassBottomShade(WidgetAppearance(glass = true, glassTransparency = 0f))
        val shade1 = widgetGlassBottomShade(WidgetAppearance(glass = true, glassTransparency = 1f))
        assertEquals(0.08f, shade0, 0.0001f)
        assertEquals(0.04f, shade1, 0.0001f)
    }

    @Test fun `透過度が変わると描画キャッシュのキーも変わる`() {
        val a = WidgetAppearance(glass = true, glassTransparency = 0.35f)
        val b = a.copy(glassTransparency = 0.8f)
        assert(a != b && a.hashCode() != b.hashCode())
    }

    @Test fun `屈折の強さは旧ペイロードで既定値、範囲外は端へ丸める`() {
        assertEquals(DEFAULT_WIDGET_GLASS_REFRACTION, parseWidgetGlassRefraction(null), 0f)
        assertEquals(DEFAULT_WIDGET_GLASS_REFRACTION, parseWidgetGlassRefraction("80"), 0f)
        assertEquals(DEFAULT_WIDGET_GLASS_REFRACTION, parseWidgetGlassRefraction(Double.NaN), 0f)
        assertEquals(0f, parseWidgetGlassRefraction(-5), 0f)
        assertEquals(1f, parseWidgetGlassRefraction(180), 0f)
        assertEquals(0.82f, parseWidgetGlassRefraction(82), 0.0001f)
    }

    @Test fun `屈折0では色分散が消え、強いほど縁が太く明るい`() {
        val none = widgetGlassOptics(WidgetAppearance(glass = true, glassRefraction = 0f))
        val max = widgetGlassOptics(WidgetAppearance(glass = true, glassRefraction = 1f))
        assertEquals(0f, none.dispersionAlpha, 0f)
        assert(max.rimWidthDp > none.rimWidthDp && max.rimAlpha > none.rimAlpha && max.sheenAlpha > none.sheenAlpha)
        assert(max.rimAlpha <= 1f && max.sheenAlpha <= 1f)
        // 縁は太い白枠にせず、最大でも1.5dpの細い線に留める。
        assert(max.rimWidthDp <= 1.5f && max.shadeAlpha > none.shadeAlpha)
    }

    @Test fun `透明側は散乱光なし、マット側で散乱光が増える`() {
        val clear = widgetGlassOptics(WidgetAppearance(glass = true, glassTransparency = 1f))
        val matte = widgetGlassOptics(WidgetAppearance(glass = true, glassTransparency = 0f))
        assertEquals(0f, clear.frostVeil, 0f)
        assert(matte.frostVeil > 0.1f)
    }

    @Test fun `屈折の強さが変わると描画キャッシュのキーも変わる`() {
        val a = WidgetAppearance(glass = true, glassRefraction = 0.5f)
        assert(a != a.copy(glassRefraction = 0.9f))
    }
}

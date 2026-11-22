package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import kotlin.math.pow

internal const val WIDGET_APPEARANCE_KEY = "widgetAppearance"

internal data class WidgetAppearance(
    val backgroundColor: Color = Color.White,
    val surfaceColor: Color = Color.White,
    val primaryTextColor: Color = Color(0xFF1A1C1E),
    val secondaryTextColor: Color = Color(0xFF585F68),
    val mutedTextColor: Color = Color(0xFFA0A6AD),
    val accentColor: Color = Color(0xFF2563EB),
    val todayColor: Color = Color(0xFFEAF1FF),
    val todayTextColor: Color = Color(0xFF2563EB),
    val appFontScale: Float = 1f,
    /** テーマ「ガラス」。透明寄りの面と反射・厚みのある縁で描く。 */
    val glass: Boolean = false,
    /** ガラス面の透過度(0=不透明、1=面が透明)。文字・予定・縁の反射には適用しない。 */
    val glassTransparency: Float = DEFAULT_WIDGET_GLASS_TRANSPARENCY,
    /** アプリ設定「屈折の強さ」(0〜1、調整値でIORではない)。縁の厚み・反射・色分散の強さに使う。 */
    val glassRefraction: Float = DEFAULT_WIDGET_GLASS_REFRACTION,
)

/** アプリ設定の既定値35%と一致させる。壁紙が不明でも濃紺文字が読める範囲に留める。 */
internal const val DEFAULT_WIDGET_GLASS_TRANSPARENCY = 0.35f

/** アプリ設定の既定値50と一致させる。旧形式(項目なし)もこの値で描く。 */
internal const val DEFAULT_WIDGET_GLASS_REFRACTION = 0.5f

/** 0〜100の保存値を0〜1へ変換する。欠損・数値以外・非有限値は既定値、範囲外は端へ丸める。 */
internal fun parseWidgetGlassTransparency(value: Any?): Float {
    val number = (value as? Number)?.toDouble() ?: return DEFAULT_WIDGET_GLASS_TRANSPARENCY
    if (!number.isFinite()) return DEFAULT_WIDGET_GLASS_TRANSPARENCY
    return (number.coerceIn(0.0, 100.0) / 100.0).toFloat()
}

/** 屈折の強さ0〜100を0〜1へ。欠損(旧ペイロード)・数値以外・非有限値は既定値、範囲外は端へ丸める。 */
internal fun parseWidgetGlassRefraction(value: Any?): Float {
    val number = (value as? Number)?.toDouble() ?: return DEFAULT_WIDGET_GLASS_REFRACTION
    if (!number.isFinite()) return DEFAULT_WIDGET_GLASS_REFRACTION
    return (number.coerceIn(0.0, 100.0) / 100.0).toFloat()
}

private fun JSONObject.safeColor(key: String, fallback: Color): Color {
    val value = optString(key, "")
    if (!value.matches(Regex("#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?"))) return fallback
    return try { Color(android.graphics.Color.parseColor(value)) }
    catch (_: IllegalArgumentException) { fallback }
}

internal fun readWidgetAppearance(context: Context): WidgetAppearance {
    val raw = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE).getString(WIDGET_APPEARANCE_KEY, null) ?: return WidgetAppearance()
    return try {
        val json = JSONObject(raw)
        if (json.optInt("schemaVersion", 0) != 1) return WidgetAppearance()
        val savedTheme = when (json.optString("theme", "system")) {
            "light", "dark", "system", "sakura", "leaf", "ocean", "lavender", "glass" -> json.optString("theme", "system")
            else -> "system"
        }
        val systemDark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val dark = savedTheme == "dark" || (savedTheme == "system" && systemDark)
        val defaults = if (dark) WidgetAppearance(
            backgroundColor = Color(0xFF0F1B31), surfaceColor = Color(0xFF152643),
            primaryTextColor = Color(0xFFE9F0FA), secondaryTextColor = Color(0xFFA3B4CC),
            mutedTextColor = Color(0xFF6A7C96), accentColor = Color(0xFF5CC4E6),
            todayColor = Color(0xFF123350), todayTextColor = Color(0xFF5CC4E6),
        ) else WidgetAppearance()
        WidgetAppearance(
            backgroundColor = if (savedTheme == "system") defaults.backgroundColor else json.safeColor("backgroundColor", defaults.backgroundColor),
            surfaceColor = if (savedTheme == "system") defaults.surfaceColor else json.safeColor("surfaceColor", defaults.surfaceColor),
            primaryTextColor = if (savedTheme == "system") defaults.primaryTextColor else json.safeColor("primaryTextColor", defaults.primaryTextColor),
            secondaryTextColor = if (savedTheme == "system") defaults.secondaryTextColor else json.safeColor("secondaryTextColor", defaults.secondaryTextColor),
            mutedTextColor = if (savedTheme == "system") defaults.mutedTextColor else json.safeColor("mutedTextColor", defaults.mutedTextColor),
            accentColor = if (savedTheme == "system") defaults.accentColor else json.safeColor("accentColor", defaults.accentColor),
            todayColor = if (savedTheme == "system") defaults.todayColor else json.safeColor("todayColor", defaults.todayColor),
            todayTextColor = if (savedTheme == "system") defaults.todayTextColor else json.safeColor("todayTextColor", defaults.todayTextColor),
            glass = savedTheme == "glass",
            glassTransparency = parseWidgetGlassTransparency(json.opt("widgetTransparency")),
            glassRefraction = parseWidgetGlassRefraction(json.opt("widgetRefraction")),
            appFontScale = json.optDouble("appFontScale", 1.0).toFloat().let { if (it.isFinite()) it.coerceIn(0.8f, 1.2f) else 1f },
        )
    } catch (_: Exception) { WidgetAppearance() }
}

internal fun scaledSp(base: Float, appearance: WidgetAppearance): androidx.compose.ui.unit.TextUnit = (base * appearance.appFontScale).sp

/** 予定データの色を安全にウィジェット用の色へ変換する。 */
internal fun widgetEventColor(hex: String, fallback: Color): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: IllegalArgumentException) {
    fallback
}

/** 自作予定の塗りつぶしラベル上で、背景とのコントラストが高い文字色を返す。 */
internal fun widgetFilledLabelTextColor(background: Color): Color {
    fun srgbToLinear(channel: Float): Float =
        if (channel <= 0.04045f) channel / 12.92f else ((channel + 0.055f) / 1.055f).toDouble().pow(2.4).toFloat()
    val luminance = 0.2126f * srgbToLinear(background.red) +
        0.7152f * srgbToLinear(background.green) +
        0.0722f * srgbToLinear(background.blue)
    // #111827 の相対輝度。白と濃紺のコントラスト比が高い方を選ぶ。
    val darkLuminance = 0.009189219295824f
    val darkContrast = (luminance + 0.05f) / (darkLuminance + 0.05f)
    val whiteContrast = 1.05f / (luminance + 0.05f)
    if (maxOf(darkContrast, whiteContrast) < 4.5f) return Color.Black
    return if (darkContrast > whiteContrast) Color(0xFF111827) else Color.White
}


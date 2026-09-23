package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import org.json.JSONObject

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
)

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
            "light", "dark", "system", "sakura", "leaf", "ocean", "lavender" -> json.optString("theme", "system")
            else -> "system"
        }
        val systemDark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val dark = savedTheme == "dark" || (savedTheme == "system" && systemDark)
        val defaults = if (dark) WidgetAppearance(
            backgroundColor = Color(0xFF16181C), surfaceColor = Color(0xFF1E2126),
            primaryTextColor = Color(0xFFE6E8EB), secondaryTextColor = Color(0xFF9AA1A9),
            mutedTextColor = Color(0xFF5B616A), accentColor = Color(0xFF6AA0FF),
            todayColor = Color(0xFF1C2740), todayTextColor = Color(0xFF6AA0FF),
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
            appFontScale = json.optDouble("appFontScale", 1.0).toFloat().let { if (it.isFinite()) it.coerceIn(0.8f, 1.2f) else 1f },
        )
    } catch (_: Exception) { WidgetAppearance() }
}

internal fun scaledSp(base: Float, appearance: WidgetAppearance): androidx.compose.ui.unit.TextUnit = (base * appearance.appFontScale).sp

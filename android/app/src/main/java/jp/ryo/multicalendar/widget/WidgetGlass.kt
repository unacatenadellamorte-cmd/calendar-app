package jp.ryo.multicalendar.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.background
import kotlin.math.roundToInt

/** ホーム画面のぼかしに依存せず、テーマの薄色と反射でガラス面を描く。 */
internal fun widgetGlassTint(appearance: WidgetAppearance): Color =
    mixWidgetColor(appearance.backgroundColor, appearance.accentColor, 0.08f)

private fun mixWidgetColor(from: Color, to: Color, amount: Float): Color = Color(
    red = from.red * (1 - amount) + to.red * amount,
    green = from.green * (1 - amount) + to.green * amount,
    blue = from.blue * (1 - amount) + to.blue * amount,
)

@Composable
internal fun GlanceModifier.widgetGlassBackground(appearance: WidgetAppearance): GlanceModifier {
    val size = LocalSize.current
    val density = minOf(LocalContext.current.resources.displayMetrics.density, 2f,
        512f / maxOf(size.width.value, size.height.value).coerceAtLeast(1f))
    val bitmap = remember(size, density, appearance) {
        // RemoteViewsの画像転送量を抑え、リサイズ時にも縁の太さを保つ。
        val width = (size.width.value * density).roundToInt().coerceIn(1, 1200)
        val height = (size.height.value * density).roundToInt().coerceIn(1, 1200)
        val image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(image)
        val bounds = RectF(0.5f * density, 0.5f * density, width - 0.5f * density, height - 0.5f * density)
        val radius = minOf(22f * density, minOf(width, height) / 4f)
        val tint = widgetGlassTint(appearance)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(),
            intArrayOf(mixWidgetColor(tint, Color.White, 0.14f).copy(alpha = 0.96f).toArgb(),
                tint.copy(alpha = 0.94f).toArgb(),
                mixWidgetColor(tint, appearance.accentColor, 0.05f).copy(alpha = 0.96f).toArgb()),
            floatArrayOf(0f, 0.42f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = density
        paint.shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(),
            Color.White.copy(alpha = 0.62f).toArgb(),
            appearance.accentColor.copy(alpha = 0.22f).toArgb(), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        image
    }
    return background(ImageProvider(bitmap))
}

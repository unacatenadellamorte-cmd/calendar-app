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
import androidx.glance.action.Action
import androidx.glance.action.clickable
import jp.ryo.multicalendar.R
import kotlin.math.roundToInt

/** ホーム画面のぼかしに依存せず、テーマの薄色と反射でガラス面を描く。 */
internal fun widgetGlassTint(appearance: WidgetAppearance): Color =
    mixWidgetColor(appearance.backgroundColor, appearance.accentColor, 0.08f)

private fun mixWidgetColor(from: Color, to: Color, amount: Float): Color = Color(
    red = from.red * (1 - amount) + to.red * amount,
    green = from.green * (1 - amount) + to.green * amount,
    blue = from.blue * (1 - amount) + to.blue * amount,
)

/** OSの押下反応を使い、更新待ちの間も操作をすぐに伝える。 */
internal fun GlanceModifier.widgetClickable(action: Action, appearance: WidgetAppearance): GlanceModifier =
    clickable(action, rippleOverride = widgetRippleResource(appearance))

/** RemoteViewsで使える描画資産を、保存済みテーマのアクセント色に対応させる。 */
internal fun widgetRippleResource(appearance: WidgetAppearance): Int = when (appearance.accentColor.toArgb() and 0xffffff) {
    0x5cc4e6 -> R.drawable.widget_touch_feedback_dark
    0xa52c62 -> R.drawable.widget_touch_feedback_sakura
    0x326c36 -> R.drawable.widget_touch_feedback_leaf
    0x086d9e -> R.drawable.widget_touch_feedback_ocean
    0x7042a8 -> R.drawable.widget_touch_feedback_lavender
    0x0a6fa5 -> R.drawable.widget_touch_feedback_glass
    else -> R.drawable.widget_touch_feedback
}

/** TextViewのクリップ差に依存せず、小さな操作面にも丸い縁を描く。 */
@Composable
internal fun GlanceModifier.widgetControlBackground(appearance: WidgetAppearance): GlanceModifier {
    val image = remember(appearance) {
        val bitmap = Bitmap.createBitmap(96, 108, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val bounds = RectF(1f, 1f, 95f, 107f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, 96f, 108f,
            mixWidgetColor(appearance.todayColor, Color.White, 0.10f).toArgb(),
            appearance.todayColor.toArgb(), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, 24f, 24f, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2f
        paint.shader = LinearGradient(0f, 0f, 96f, 108f,
            Color.White.copy(alpha = 0.32f).toArgb(), appearance.accentColor.copy(alpha = 0.18f).toArgb(), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, 24f, 24f, paint)
        bitmap
    }
    return background(ImageProvider(image))
}

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
            intArrayOf(mixWidgetColor(tint, Color.White, 0.14f).copy(alpha = if (appearance.glass) 0.80f else 0.96f).toArgb(),
                tint.copy(alpha = if (appearance.glass) 0.72f else 0.94f).toArgb(),
                mixWidgetColor(tint, appearance.accentColor, 0.05f).copy(alpha = if (appearance.glass) 0.80f else 0.96f).toArgb()),
            floatArrayOf(0f, 0.42f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        if (appearance.glass) drawGlassLayers(canvas, bounds, radius, width, height, density, appearance)
        // 面の下側を沈め、反射の縁と本文の面を分ける。毎フレームの再描画は行わない。
        paint.shader = LinearGradient(0f, 0f, 0f, height.toFloat(),
            intArrayOf(Color.Transparent.toArgb(), Color.Transparent.toArgb(),
                Color.Black.copy(alpha = 0.10f).toArgb()),
            floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = density
        paint.shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(),
            Color.White.copy(alpha = 0.62f).toArgb(),
            appearance.accentColor.copy(alpha = 0.22f).toArgb(), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        if (minOf(width, height) > 12f * density) {
            val inner = RectF(bounds).apply { inset(2f * density, 2f * density) }
            paint.strokeWidth = 0.7f * density
            paint.shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(),
                intArrayOf(Color.White.copy(alpha = 0.22f).toArgb(), Color.Transparent.toArgb(),
                    appearance.accentColor.copy(alpha = 0.16f).toArgb()),
                floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
            canvas.drawRoundRect(inner, (radius - 2f * density).coerceAtLeast(0f),
                (radius - 2f * density).coerceAtLeast(0f), paint)
        }
        image
    }
    return background(ImageProvider(bitmap))
}

/**
 * テーマ「ガラス」の描画済みの層。ホーム壁紙をリアルタイムにぼかすことはOS制限で不可のため、
 * 半透明の面・斜めの反射帯・厚みのある縁・縁の色ずれ(屈折の近似)を事前に描く。文字面は薄い白濁を残す。
 */
private fun drawGlassLayers(canvas: Canvas, bounds: RectF, radius: Float, width: Int, height: Int, density: Float, appearance: WidgetAppearance) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = LinearGradient(0f, 0f, width * 0.75f, height * 0.7f,
        intArrayOf(Color.White.copy(alpha = 0.50f).toArgb(), Color.White.copy(alpha = 0.10f).toArgb(), Color.Transparent.toArgb()),
        floatArrayOf(0f, 0.3f, 0.55f), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(bounds, radius, radius, paint)
    paint.shader = LinearGradient(0f, height * 0.6f, 0f, height.toFloat(),
        intArrayOf(Color.Transparent.toArgb(), mixWidgetColor(appearance.accentColor, Color.White, 0.2f).copy(alpha = 0.16f).toArgb()),
        null, Shader.TileMode.CLAMP)
    canvas.drawRoundRect(bounds, radius, radius, paint)
    paint.shader = null
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 2.2f * density
    paint.color = Color.White.copy(alpha = 0.75f).toArgb()
    canvas.drawRoundRect(bounds, radius, radius, paint)
    if (minOf(width, height) > 14f * density) {
        val gap = 2.4f * density
        val inner = RectF(bounds).apply { inset(gap, gap) }
        paint.strokeWidth = 1.2f * density
        paint.color = Color(0xFF8fd8ff).copy(alpha = 0.40f).toArgb()
        canvas.drawRoundRect(inner, (radius - gap).coerceAtLeast(0f), (radius - gap).coerceAtLeast(0f), paint)
        inner.inset(1.2f * density, 1.2f * density)
        paint.strokeWidth = 1f * density
        paint.color = Color(0xFFffb0e0).copy(alpha = 0.22f).toArgb()
        canvas.drawRoundRect(inner, (radius - 3.6f * density).coerceAtLeast(0f), (radius - 3.6f * density).coerceAtLeast(0f), paint)
    }
}

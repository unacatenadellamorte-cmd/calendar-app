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

/** 背景面のグラデーション3点(左上・中央・右下)の不透明度。ガラスは本人設定の透過度に従う。 */
internal fun widgetGlassFaceAlphas(appearance: WidgetAppearance): FloatArray {
    if (!appearance.glass) return floatArrayOf(0.96f, 0.94f, 0.96f)
    val face = 1f - appearance.glassTransparency.coerceIn(0f, 1f)
    // 端をわずかに白く残し、厚みと縁の位置を透明時にも伝える。
    return floatArrayOf((face + 0.06f).coerceAtMost(1f), face, (face + 0.04f).coerceAtMost(1f))
}

/** 面の下側の陰影。透明になるほど壁紙を濁さないよう弱める。 */
internal fun widgetGlassBottomShade(appearance: WidgetAppearance): Float =
    if (appearance.glass) 0.10f * (1f - 0.6f * appearance.glassTransparency.coerceIn(0f, 1f)) else 0.10f

/**
 * ウィジェットのガラス表現の強さ。ホーム壁紙の実時間の屈折・ぼかしはRemoteViewsでは不可のため、
 * 「屈折の強さ」は縁の厚み・反射・色分散へ、「透過度」の低さ(マット側)は面内の散乱光へ割り当てる。
 */
internal data class WidgetGlassOptics(
    /** 縁の反射の線幅(dp)。屈折0で1.6dp、最大で3.6dp。 */
    val rimWidthDp: Float,
    /** 縁の反射の白さ(最も強い角)。 */
    val rimAlpha: Float,
    /** 斜めの反射帯の白さ。 */
    val sheenAlpha: Float,
    /** 縁の色分散の濃さ。屈折0では消える。 */
    val dispersionAlpha: Float,
    /** すりガラスの散乱光(面の内側に広がる淡い白)。透明側0、マット側で最大。 */
    val frostVeil: Float,
)

internal fun widgetGlassOptics(appearance: WidgetAppearance): WidgetGlassOptics {
    val refraction = appearance.glassRefraction.let { if (it.isFinite()) it.coerceIn(0f, 1f) else DEFAULT_WIDGET_GLASS_REFRACTION }
    val frost = 1f - appearance.glassTransparency.let { if (it.isFinite()) it.coerceIn(0f, 1f) else DEFAULT_WIDGET_GLASS_TRANSPARENCY }
    return WidgetGlassOptics(
        rimWidthDp = 1.6f + 2f * refraction,
        rimAlpha = 0.72f + 0.26f * refraction,
        sheenAlpha = 0.30f + 0.28f * refraction,
        dispersionAlpha = 0.48f * refraction,
        frostVeil = 0.22f * frost,
    )
}

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
        val faceAlphas = widgetGlassFaceAlphas(appearance)
        paint.shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(),
            intArrayOf(mixWidgetColor(tint, Color.White, 0.14f).copy(alpha = faceAlphas[0]).toArgb(),
                tint.copy(alpha = faceAlphas[1]).toArgb(),
                mixWidgetColor(tint, appearance.accentColor, 0.05f).copy(alpha = faceAlphas[2]).toArgb()),
            floatArrayOf(0f, 0.42f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
        if (appearance.glass) drawGlassLayers(canvas, bounds, radius, width, height, density, appearance)
        // 面の下側を沈め、反射の縁と本文の面を分ける。毎フレームの再描画は行わない。
        paint.shader = LinearGradient(0f, 0f, 0f, height.toFloat(),
            intArrayOf(Color.Transparent.toArgb(), Color.Transparent.toArgb(),
                Color.Black.copy(alpha = widgetGlassBottomShade(appearance)).toArgb()),
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
    val optics = widgetGlassOptics(appearance)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    if (optics.frostVeil > 0.005f) {
        // すりガラスの散乱: 中央から縁へ淡く広がる白(壁紙はぼかせないため、光の拡散だけを描く)。
        paint.shader = android.graphics.RadialGradient(width * 0.42f, height * 0.38f, maxOf(width, height) * 0.75f,
            intArrayOf(Color.White.copy(alpha = optics.frostVeil).toArgb(), Color.White.copy(alpha = optics.frostVeil * 0.55f).toArgb()),
            null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
    }
    paint.shader = LinearGradient(0f, 0f, width * 0.75f, height * 0.7f,
        intArrayOf(Color.White.copy(alpha = optics.sheenAlpha).toArgb(), Color.White.copy(alpha = optics.sheenAlpha * 0.2f).toArgb(), Color.Transparent.toArgb()),
        floatArrayOf(0f, 0.3f, 0.55f), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(bounds, radius, radius, paint)
    paint.shader = LinearGradient(0f, height * 0.6f, 0f, height.toFloat(),
        intArrayOf(Color.Transparent.toArgb(), mixWidgetColor(appearance.accentColor, Color.White, 0.2f).copy(alpha = 0.16f).toArgb()),
        null, Shader.TileMode.CLAMP)
    canvas.drawRoundRect(bounds, radius, radius, paint)
    paint.shader = null
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = optics.rimWidthDp * density
    // 参考の厚いガラス縁に合わせ、右上と左下を最も白く光らせる。縁は線幅の半分だけ内側へ寄せて欠けを防ぐ。
    val rim = RectF(bounds).apply { inset(paint.strokeWidth / 2f, paint.strokeWidth / 2f) }
    val rimRadius = (radius - paint.strokeWidth / 2f).coerceAtLeast(0f)
    paint.shader = LinearGradient(width.toFloat(), 0f, 0f, height.toFloat(),
        intArrayOf(Color.White.copy(alpha = optics.rimAlpha).toArgb(), Color.White.copy(alpha = optics.rimAlpha * 0.55f).toArgb(),
            Color.White.copy(alpha = optics.rimAlpha * 0.95f).toArgb()),
        floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(rim, rimRadius, rimRadius, paint)
    paint.shader = null
    if (optics.dispersionAlpha > 0.01f && width > 40f * density && height > 24f * density) {
        // 上下の縁に沿った色分散(赤→黄→緑→青)。屈折の強さに比例し、描画は一度だけ。
        val streak = Paint(Paint.ANTI_ALIAS_FLAG)
        streak.style = Paint.Style.STROKE
        streak.strokeWidth = (0.8f + 0.6f * appearance.glassRefraction.coerceIn(0f, 1f)) * density
        val a = optics.dispersionAlpha
        val colors = intArrayOf(Color.Transparent.toArgb(), Color(0xFFff6b6b).copy(alpha = a).toArgb(),
            Color(0xFFffd84a).copy(alpha = a).toArgb(), Color(0xFF5be3a0).copy(alpha = a * 0.9f).toArgb(),
            Color(0xFF6bb8ff).copy(alpha = a * 0.75f).toArgb(), Color.Transparent.toArgb())
        val stops = floatArrayOf(0f, 0.2f, 0.4f, 0.6f, 0.8f, 1f)
        val inset = optics.rimWidthDp * density + 0.6f * density
        val topY = bounds.top + inset
        streak.shader = LinearGradient(width * 0.42f, 0f, width * 0.70f, 0f, colors, stops, Shader.TileMode.CLAMP)
        canvas.drawLine(width * 0.42f, topY, width * 0.70f, topY, streak)
        val bottomY = bounds.bottom - inset
        streak.shader = LinearGradient(width * 0.18f, 0f, width * 0.46f, 0f, colors, stops, Shader.TileMode.CLAMP)
        canvas.drawLine(width * 0.18f, bottomY, width * 0.46f, bottomY, streak)
    }
    if (minOf(width, height) > 14f * density) {
        // 縁の内側の淡い色付きの線(厚いガラスの内面反射)。屈折が強いほど内側へ入り、はっきりする。
        val gap = (optics.rimWidthDp + 0.8f) * density
        val inner = RectF(bounds).apply { inset(gap, gap) }
        paint.strokeWidth = 1.1f * density
        paint.color = Color(0xFF8fd8ff).copy(alpha = 0.18f + 0.3f * appearance.glassRefraction.coerceIn(0f, 1f)).toArgb()
        canvas.drawRoundRect(inner, (radius - gap).coerceAtLeast(0f), (radius - gap).coerceAtLeast(0f), paint)
        inner.inset(1.2f * density, 1.2f * density)
        paint.strokeWidth = 1f * density
        paint.color = Color(0xFFffb0e0).copy(alpha = 0.1f + 0.16f * appearance.glassRefraction.coerceIn(0f, 1f)).toArgb()
        val r2 = (radius - gap - 1.2f * density).coerceAtLeast(0f)
        canvas.drawRoundRect(inner, r2, r2, paint)
    }
}

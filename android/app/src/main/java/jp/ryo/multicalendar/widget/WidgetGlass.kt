package jp.ryo.multicalendar.widget

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
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

/**
 * 背景面のグラデーション3点(左上・中央・右下)の不透明度。全テーマ共通で本人設定の透過度に従う。
 * 壁紙の明暗は分からず、ウィジェットの文字には影も付けられないため、透過100%でも面を30%残し(文字の保護面)、
 * テーマ色の面の上でテーマの文字色が読めるようにする。
 * アプリから外観を受け取っていない旧データでは従来の不透明寄りの面。
 */
internal fun widgetGlassFaceAlphas(appearance: WidgetAppearance): FloatArray {
    if (!appearance.glass) return floatArrayOf(0.96f, 0.94f, 0.96f)
    val face = 1f - WIDGET_GLASS_CLEAR_RANGE * appearance.glassTransparency.coerceIn(0f, 1f)
    // 光の当たる左上をわずかに厚く残し、面の向きを透明時にも伝える。
    return floatArrayOf((face + 0.05f).coerceAtMost(1f), face, (face + 0.02f).coerceAtMost(1f))
}

/** 透過100%で消える面の割合(残り30%は文字の保護面)。 */
internal const val WIDGET_GLASS_CLEAR_RANGE = 0.7f

/** 面の下側の陰影。透明になるほど壁紙を濁さないよう弱める。 */
internal fun widgetGlassBottomShade(appearance: WidgetAppearance): Float =
    if (appearance.glass) 0.08f * (1f - 0.5f * appearance.glassTransparency.coerceIn(0f, 1f)) else 0.10f

/**
 * ウィジェットのガラス表現の強さ。ホーム壁紙の実時間の屈折・ぼかしはRemoteViewsでは不可のため、
 * 「屈折の強さ」は縁の反射・内側の明暗・色分散へ、「透過度」の低さ(マット側)は面内の散乱光へ割り当てる。
 * 参考の丸い凸ガラスに合わせ、太い白枠ではなく、光の当たる右下だけ細く明るい線と内側の柔らかな明暗で厚みを出す。
 */
internal data class WidgetGlassOptics(
    /** 縁の線幅(dp)。細いまま、屈折が強いほどわずかに太る(1〜1.5dp)。 */
    val rimWidthDp: Float,
    /** 右下の縁の反射の白さ。 */
    val rimAlpha: Float,
    /** 縁の内側の柔らかな明部(厚みを通った光)の白さ。 */
    val sheenAlpha: Float,
    /** 縁の色分散の濃さ。屈折0では消える。 */
    val dispersionAlpha: Float,
    /** すりガラスの散乱光(面の内側に広がる淡い白)。透明側0、マット側で最大。 */
    val frostVeil: Float,
    /** 左上の縁の細い影と内側の暗部の濃さ。 */
    val shadeAlpha: Float,
)

internal fun widgetGlassOptics(appearance: WidgetAppearance): WidgetGlassOptics {
    val refraction = appearance.glassRefraction.let { if (it.isFinite()) it.coerceIn(0f, 1f) else DEFAULT_WIDGET_GLASS_REFRACTION }
    val frost = 1f - appearance.glassTransparency.let { if (it.isFinite()) it.coerceIn(0f, 1f) else DEFAULT_WIDGET_GLASS_TRANSPARENCY }
    return WidgetGlassOptics(
        rimWidthDp = 1f + 0.5f * refraction,
        rimAlpha = 0.55f + 0.35f * refraction,
        sheenAlpha = 0.22f + 0.26f * refraction,
        dispersionAlpha = 0.42f * refraction,
        frostVeil = 0.18f * frost,
        shadeAlpha = 0.10f + 0.10f * refraction,
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
        if (appearance.glass) {
            drawGlassLayers(canvas, bounds, radius, width, height, density, appearance)
        } else {
            // 外観未受信(旧データ)の従来面: 下側を沈め、細い1本の縁だけを描く。
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
        }
        image
    }
    return background(ImageProvider(bitmap))
}

/**
 * ガラスの描画済みの層(全テーマ共通、テーマ色で着色)。ホーム壁紙をリアルタイムにぼかす・曲げることは
 * OS制限で不可のため、面・散乱光・縁の明暗・色分散を一度だけ描く近似。
 * 縁: 右下は細く明るい反射、左上は細い影。内側: 右下の縁沿いに柔らかな明部、左上の内側に暗部(丸みと厚み)。
 * 均一な白枠・二重線・ネオン色の内側線は使わない。
 */
private fun drawGlassLayers(canvas: Canvas, bounds: RectF, radius: Float, width: Int, height: Int, density: Float, appearance: WidgetAppearance) {
    val optics = widgetGlassOptics(appearance)
    val w = width.toFloat()
    val h = height.toFloat()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val shadeColor = mixWidgetColor(appearance.primaryTextColor, Color.Black, 0.4f)
    if (optics.frostVeil > 0.005f) {
        // すりガラスの散乱: 左上から中央へ淡く広がる白(壁紙はぼかせないため、光の拡散だけを描く)。
        paint.shader = android.graphics.RadialGradient(w * 0.3f, h * 0.2f, maxOf(w, h) * 0.85f,
            intArrayOf(Color.White.copy(alpha = optics.frostVeil).toArgb(), Color.White.copy(alpha = optics.frostVeil * 0.45f).toArgb()),
            null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, paint)
    }
    // 面の下側をわずかに沈める(接地側)。
    paint.shader = LinearGradient(0f, 0f, 0f, h,
        intArrayOf(Color.Transparent.toArgb(), Color.Transparent.toArgb(), shadeColor.copy(alpha = widgetGlassBottomShade(appearance)).toArgb()),
        floatArrayOf(0f, 0.6f, 1f), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(bounds, radius, radius, paint)
    paint.shader = null
    if (minOf(width, height) > 14f * density) {
        // 内側の柔らかな明暗。面の形で切り抜き、太い線をぼかして縁沿いの光と陰だけを残す。
        val save = canvas.save()
        canvas.clipPath(Path().apply { addRoundRect(bounds, radius, radius, Path.Direction.CW) })
        val glow = Paint(Paint.ANTI_ALIAS_FLAG)
        glow.style = Paint.Style.STROKE
        val spread = (5f + 5f * appearance.glassRefraction.coerceIn(0f, 1f)) * density
        glow.strokeWidth = spread
        glow.maskFilter = BlurMaskFilter(spread * 0.9f, BlurMaskFilter.Blur.NORMAL)
        // 右下へ向かって明るく(光が厚みを通って出る側)。
        glow.shader = LinearGradient(0f, 0f, w, h,
            intArrayOf(Color.Transparent.toArgb(), Color.Transparent.toArgb(), Color.White.copy(alpha = optics.sheenAlpha).toArgb()),
            floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, glow)
        // 左上の内側へ淡い暗部。
        glow.shader = LinearGradient(0f, 0f, w, h,
            intArrayOf(shadeColor.copy(alpha = optics.shadeAlpha * 0.7f).toArgb(), Color.Transparent.toArgb(), Color.Transparent.toArgb()),
            floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(bounds, radius, radius, glow)
        canvas.restoreToCount(save)
    }
    // 縁: 1本の細い線。左上は影色、中間は薄れ、右下は明るい反射。
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = optics.rimWidthDp * density
    val rim = RectF(bounds).apply { inset(paint.strokeWidth / 2f, paint.strokeWidth / 2f) }
    val rimRadius = (radius - paint.strokeWidth / 2f).coerceAtLeast(0f)
    paint.shader = LinearGradient(0f, 0f, w, h,
        intArrayOf(shadeColor.copy(alpha = optics.shadeAlpha).toArgb(),
            Color.White.copy(alpha = 0.12f).toArgb(),
            Color.White.copy(alpha = optics.rimAlpha * 0.5f).toArgb(),
            Color.White.copy(alpha = optics.rimAlpha).toArgb()),
        floatArrayOf(0f, 0.4f, 0.7f, 1f), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(rim, rimRadius, rimRadius, paint)
    // 丸みの頂点(上縁)のごく細い映り込み。
    paint.strokeWidth = 0.6f * density
    paint.shader = LinearGradient(0f, 0f, w, 0f,
        intArrayOf(Color.Transparent.toArgb(), Color.White.copy(alpha = 0.35f).toArgb(), Color.Transparent.toArgb()),
        floatArrayOf(0.1f, 0.5f, 0.9f), Shader.TileMode.CLAMP)
    if (bounds.width() > 2f * radius) {
        canvas.drawLine(bounds.left + radius, bounds.top + 0.8f * density, bounds.right - radius, bounds.top + 0.8f * density, paint)
    }
    paint.shader = null
    if (optics.dispersionAlpha > 0.01f && width > 40f * density && height > 24f * density) {
        // 上下の縁の中央だけに細い色分散(赤→黄→緑→青)。屈折の強さに比例し、描画は一度だけ。
        val streak = Paint(Paint.ANTI_ALIAS_FLAG)
        streak.style = Paint.Style.STROKE
        streak.strokeWidth = 0.9f * density
        val a = optics.dispersionAlpha
        val colors = intArrayOf(Color.Transparent.toArgb(), Color(0xFFff6b6b).copy(alpha = a).toArgb(),
            Color(0xFFffd84a).copy(alpha = a).toArgb(), Color(0xFF5be3a0).copy(alpha = a * 0.9f).toArgb(),
            Color(0xFF6bb8ff).copy(alpha = a * 0.75f).toArgb(), Color.Transparent.toArgb())
        val stops = floatArrayOf(0f, 0.2f, 0.4f, 0.6f, 0.8f, 1f)
        val inset = optics.rimWidthDp * density
        val topY = bounds.top + inset
        streak.shader = LinearGradient(w * 0.40f, 0f, w * 0.66f, 0f, colors, stops, Shader.TileMode.CLAMP)
        canvas.drawLine(w * 0.40f, topY, w * 0.66f, topY, streak)
        val bottomY = bounds.bottom - inset
        streak.shader = LinearGradient(w * 0.62f, 0f, w * 0.36f, 0f, colors, stops, Shader.TileMode.CLAMP)
        canvas.drawLine(w * 0.36f, bottomY, w * 0.62f, bottomY, streak)
    }
}

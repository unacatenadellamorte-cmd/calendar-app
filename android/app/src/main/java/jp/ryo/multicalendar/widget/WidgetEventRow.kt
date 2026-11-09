package jp.ryo.multicalendar.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.background
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import kotlin.math.abs
import kotlin.math.roundToInt

/** 共有データの優先順を保ち、表示できた同一予定だけを日付の境界で結ぶ。 */
internal fun widgetRowEvents(days: List<WidgetDay?>, events: List<CalendarOverviewEvent>, capacity: Int): List<List<CalendarOverviewEvent>> =
    days.map { day -> if (day == null) emptyList() else eventsForWidgetDay(events, day).take(capacity.coerceAtLeast(0)) }

internal fun widgetContinuationTitle(event: CalendarOverviewEvent, day: WidgetDay, joinedBefore: Boolean, joinedAfter: Boolean): String {
    val before = if (event.startDate < day && !joinedBefore) "←" else ""
    val after = if (day < event.endDate && !joinedAfter) "→" else ""
    return before + shortWidgetTitle(event.title.ifBlank { event.calendarName }, 7 - before.length - after.length) + after
}

/** 本体と同じ、ラベルの段だけが変わる丸いマーカー。週端や省略された予定へは線を引かない。 */
@Composable
internal fun WidgetEventRow(
    days: List<WidgetDay?>,
    overview: CalendarOverview,
    appearance: WidgetAppearance,
    today: WidgetDay,
    cellHeight: Float,
    fontScale: Float,
) {
    val context = LocalContext.current
    val width = (LocalSize.current.width.value - 12f).coerceAtLeast(1f)
    val density = minOf(context.resources.displayMetrics.density, 2f, 512f / width)
    val capacity = monthEventLineCapacity(cellHeight, fontScale).coerceAtMost(4)
    val rows = remember(days, overview, capacity) { widgetRowEvents(days, overview.events, capacity) }
    val image = remember(rows, width, cellHeight, fontScale, density, appearance) {
        val bitmap = Bitmap.createBitmap((width * density).roundToInt().coerceAtLeast(1),
            (cellHeight * density).roundToInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap).apply { scale(density, density) }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val cellWidth = width / 7f
        val labelHeight = 12f * fontScale
        val top = 1f + 16f * fontScale
        // 同じ色でも別の予定は合流させない。重複IDも列内の位置で照合する。
        rows.flatten().distinctBy { it.id }.forEach { event ->
            val path = Path()
            if (event.filledLabel) {
                rows.forEachIndexed { column, labels ->
                    labels.forEachIndexed { lane, label ->
                        if (label.id == event.id) {
                            val body = Path().apply { addRoundRect(RectF(column * cellWidth + 2f,
                                top + lane * labelHeight, (column + 1) * cellWidth - 2f,
                                top + (lane + 1) * labelHeight), 2f, 2f, Path.Direction.CW) }
                            path.op(body, Path.Op.UNION)
                        }
                    }
                }
            }
            for (column in 0 until rows.lastIndex) {
                if (event.id.isBlank()) continue
                val lane = rows[column].indexOfFirst { it.id == event.id }
                val next = rows[column + 1].indexOfFirst { it.id == event.id }
                if (lane < 0 || next < 0) continue
                val x = (column + 1) * cellWidth
                val y = top + (lane + 0.5f) * labelHeight
                val offset = (next - lane) * labelHeight
                val bridge = widgetMarkerBridge(x, y, offset, labelHeight / 2f, event.filledLabel)
                if (event.filledLabel) path.op(bridge, Path.Op.UNION) else path.addPath(bridge)
            }
            paint.color = widgetEventColor(event.colorHex, appearance.accentColor).toArgb()
            paint.style = if (event.filledLabel) Paint.Style.FILL else Paint.Style.STROKE
            paint.strokeWidth = 1.4f
            paint.strokeCap = Paint.Cap.ROUND
            paint.strokeJoin = Paint.Join.ROUND
            canvas.drawPath(path, paint)
        }
        bitmap
    }
    Box(modifier = GlanceModifier.fillMaxWidth().height(cellHeight.dp).background(ImageProvider(image))) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(cellHeight.dp)) {
            days.forEachIndexed { column, day ->
                if (day == null) Spacer(modifier = GlanceModifier.defaultWeight().height(cellHeight.dp))
                else CalendarWidgetDayCell(context, overview, appearance, today, day, cellHeight,
                    fontScale, GlanceModifier.defaultWeight(), connectedLabels = true,
                    previousVisibleIds = rows.getOrNull(column - 1)?.map { it.id }?.toSet().orEmpty(),
                    nextVisibleIds = rows.getOrNull(column + 1)?.map { it.id }?.toSet().orEmpty())
            }
        }
    }
}

/** ラベルの面と細い縦線を同一の塗り形状で結ぶ。本体の曲線をウィジェット寸法へ縮める。 */
private fun widgetMarkerBridge(x: Float, y: Float, offset: Float, half: Float, filled: Boolean): Path {
    val distance = abs(offset)
    val sign = if (offset < 0) -1f else 1f
    val p = Path()
    if (!filled) {
        val bend = minOf(2f, distance / 2f)
        p.moveTo(-6f, 0f)
        if (distance == 0f) p.lineTo(6f, 0f) else {
            p.lineTo(-bend, 0f); p.quadTo(0f, 0f, 0f, bend)
            p.lineTo(0f, distance - bend); p.quadTo(0f, distance, bend, distance); p.lineTo(6f, distance)
        }
    } else if (distance == 0f) p.addRect(-6f, -half, 6f, half, Path.Direction.CW)
    else {
        val outer = minOf(half, 4f)
        val inner = minOf(1.5f, half / 2f)
        val left = -1.2f; val right = 1.2f
        p.moveTo(-6f, -half); p.lineTo(right - outer, -half)
        p.quadTo(right, -half, right, -half + outer)
        p.lineTo(right, distance - half - inner)
        p.quadTo(right, distance - half, right + inner, distance - half)
        p.lineTo(6f, distance - half); p.lineTo(6f, distance + half)
        p.lineTo(left + outer, distance + half)
        p.quadTo(left, distance + half, left, distance + half - outer)
        p.lineTo(left, half + inner); p.quadTo(left, half, left - inner, half)
        p.lineTo(-6f, half); p.close()
    }
    p.transform(android.graphics.Matrix().apply { setScale(1f, sign); postTranslate(x, y) })
    return p
}

package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** 「日」ウィジェット。配置済みの受信先を維持して新しい予定一覧へ移行する。 */
class FeaturedEventsWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact

    override suspend fun onDelete(context: Context, glanceId: GlanceId) {
        forgetWidgetDate(glanceId)
    }

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            DayAgendaContent()
        }
    }
}

/** iOS App Group 識別子(AD-18)と同じ文字列。Android では SharedPreferences のファイル名として流用する。 */
internal const val WIDGET_GROUP = "group.jp.ryo.multicalendar.widget"
internal const val WIDGET_ITEM_KEY = "featuredEvents"
private const val DEFAULT_COLOR_HEX = "#7A7A7A"

/**
 * 1行(小)/2行(中)/3行(大)。件数はウィジェットの「高さ」だけで決める ── 3サイズとも幅は同一にする。
 * `SizeMode.Responsive` は幅・高さの両方で最も近いサイズを選ぶため、幅まで変えてしまうと
 * 縦方向だけのリサイズ(このウィジェットの主な使い方)で件数が変わらないことがある
 * (実機検証で確認済み)。高さは Android のセルサイズ公式(70n-30dp)、幅は3セル分で固定。
 */
private val SIZE_SMALL = DpSize(180.dp, 40.dp)
private val SIZE_MEDIUM = DpSize(180.dp, 110.dp)
private val SIZE_LARGE = DpSize(180.dp, 180.dp)

/**
 * 厳密な `==` ではなく閾値比較にする(px→dp変換の丸め誤差で完全一致しないケースへの防御)。
 * `internal` にして `src/test/java/.../FeaturedEventsWidgetTest.kt`(素のJUnit)から検証する。
 */
internal fun maxRowsFor(size: DpSize): Int = when {
    size.height < SIZE_MEDIUM.height -> 1
    size.height < SIZE_LARGE.height -> 2
    else -> 3
}

internal data class FeaturedWidgetEvent(
    val id: String,
    val calendarName: String,
    val colorHex: String,
    val startsAtIso: String,
    val allDay: Boolean,
)

/** SharedPreferences の JSON 配列を読む。壊れている/存在しない場合は空リスト(静かな表示)。 */
internal fun readFeaturedEvents(context: Context): List<FeaturedWidgetEvent> {
    val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
    val raw = prefs.getString(WIDGET_ITEM_KEY, null) ?: return emptyList()
    return try {
        val array = JSONArray(raw)
        buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                add(
                    FeaturedWidgetEvent(
                        id = obj.optString("id", ""),
                        calendarName = obj.optString("calendarName", ""),
                        colorHex = obj.optString("colorHex", DEFAULT_COLOR_HEX),
                        startsAtIso = obj.optString("startsAtIso", ""),
                        allDay = obj.optBoolean("allDay", false),
                    ),
                )
            }
        }
    } catch (e: Exception) {
        emptyList()
    }
}

/**
 * `startsAtIso` が取り得るUTC ISOの書式。`src/platform/widget.ts` は常にミリ秒付き
 * (`new Date().toISOString()`)で送るが、直接 SharedPreferences を書いた場合や将来の
 * 送信元差異への防御として、Supabase(PostgREST)の標準形であるミリ秒無し
 * (`'...T01:00:00Z'`)も受理できるようにする(2パターンを順に試す)。
 */
private val ISO_PATTERNS = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
)

internal fun parseIsoUtc(iso: String): Date? {
    for (pattern in ISO_PATTERNS) {
        val parser = SimpleDateFormat(pattern, Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        try {
            return parser.parse(iso)
        } catch (e: Exception) {
            // 次の書式を試す。
        }
    }
    return null
}

/**
 * 終日は「終日」。時刻付きは UTC ISO をデバイスのローカル時刻の "H:mm" にする(AD-7)。
 * `internal` にしてJUnitテストから検証する。
 */
internal fun formatStartLabel(event: FeaturedWidgetEvent): String {
    if (event.allDay) return "終日"
    val parsed = parseIsoUtc(event.startsAtIso) ?: return "終日"
    return SimpleDateFormat("H:mm", Locale.getDefault()).format(parsed)
}

package jp.ryo.multicalendar.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * 代表予定のホーム画面ウィジェット(Story 5.6、ARCHITECTURE-SPINE Epic5 AD-12)。
 *
 * 選抜ロジックは一切持たない ── `src/platform/widget.ts` が書き込んだ SharedPreferences
 * (`WIDGET_GROUP` / キー `featuredEvents`)の JSON をそのまま読み、ウィジェットの
 * 現在サイズに応じて件数を切り詰めて表示するだけ(AD-12)。予定タイトルは表示しない。
 *
 * JSON 1件の形は `src/platform/widget.ts` の `FeaturedWidgetEventPayload` と対:
 * `{ id, calendarName, colorHex, startsAtIso, allDay, schemaVersion }`。
 */
class FeaturedEventsWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(setOf(SIZE_SMALL, SIZE_MEDIUM, SIZE_LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            FeaturedEventsContent()
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

private fun todayLocalDate(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

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

private fun parseIsoUtc(iso: String): Date? {
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

private fun parseColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (e: IllegalArgumentException) {
    Color(android.graphics.Color.parseColor(DEFAULT_COLOR_HEX))
}

/**
 * タップ先(AD-16)。予定があれば `calendar-app://event/{id}`、
 * 無ければ今日(`calendar-app://day/{today}`)。既存のディープリンク intent-filter
 * (AndroidManifest.xml、Story 5.1、無変更)経由で MainActivity が開く。
 */
private fun deepLinkIntent(context: Context, event: FeaturedWidgetEvent?): Intent {
    // event.id は通常 UUID で実害は無いはずだが、URI に埋め込む値は防御的にエンコードする。
    return if (event != null && event.id.isNotEmpty()) {
        widgetDeepLinkIntent(context, "event", event.id)
    } else {
        widgetDeepLinkIntent(context, "day", todayLocalDate())
    }
}

@Composable
private fun AddEventButton(context: Context) {
    Text(
        text = "＋",
        style = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color(0xFF0072B2))),
        modifier = GlanceModifier
            .clickable(actionStartActivity(createWidgetIntent(context, todayWidgetDay())))
            .padding(2.dp),
    )
}

@Composable
private fun FeaturedEventsContent() {
    val context = LocalContext.current
    val size = LocalSize.current
    val events = readFeaturedEvents(context)
    val visibleRows = events.take(maxRowsFor(size))

    // 追加ボタンは予定の右に置き、小さい40dp表示でも予定を押し出さない。
    Row(modifier = GlanceModifier.fillMaxSize().background(Color.White).padding(4.dp)) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            if (visibleRows.isEmpty()) {
                Text(
                    text = "この後の予定はありません",
                    style = TextStyle(fontSize = 11.sp, color = ColorProvider(Color.DarkGray)),
                    maxLines = 1,
                    modifier = GlanceModifier.clickable(actionStartActivity(deepLinkIntent(context, null))),
                )
            }
            visibleRows.forEachIndexed { index, event ->
                if (index > 0) Spacer(modifier = GlanceModifier.height(6.dp))
                FeaturedEventRow(context, event)
            }
        }
        AddEventButton(context)
    }
}

@Composable
private fun FeaturedEventRow(context: Context, event: FeaturedWidgetEvent) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(actionStartActivity(deepLinkIntent(context, event))),
    ) {
        Spacer(
            modifier = GlanceModifier
                .width(4.dp)
                .height(20.dp)
                .background(ColorProvider(parseColor(event.colorHex))),
        )
        Spacer(modifier = GlanceModifier.width(8.dp))
        Text(
            text = formatStartLabel(event),
            style = TextStyle(
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = ColorProvider(Color.Black),
            ),
        )
        Spacer(modifier = GlanceModifier.width(6.dp))
        Text(
            text = event.calendarName,
            style = TextStyle(fontSize = 12.sp, color = ColorProvider(Color.DarkGray)),
            maxLines = 1,
        )
    }
}

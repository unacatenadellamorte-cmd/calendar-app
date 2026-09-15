package jp.ryo.calendarapp.widget

import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * `maxRowsFor`/`formatStartLabel`(いずれも `internal` な純関数)のJUnitテスト。
 * `DpSize`/`SimpleDateFormat` はどちらもAndroidランタイム不要な純Kotlin/Java APIのため、
 * エミュレータ/実機無しでホストJVM上で実行できる(`./gradlew testDebugUnitTest`)。
 *
 * Story 5.6 コードレビュー(HIGH指摘)対応: この2関数はこれまでKotlin側で
 * 一切テストされておらず、実機確認でも確定的な検証ができていなかった。
 */
class FeaturedEventsWidgetTest {

    private lateinit var originalDefaultTimeZone: TimeZone

    @Before
    fun setUp() {
        // formatStartLabel は表示に `Locale.getDefault()` のタイムゾーンを使うため、
        // テスト環境(CI/開発機)のタイムゾーンに依存せず決定的に検証できるよう固定する。
        originalDefaultTimeZone = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
    }

    @After
    fun tearDown() {
        TimeZone.setDefault(originalDefaultTimeZone)
    }

    private fun event(
        startsAtIso: String = "",
        allDay: Boolean = false,
    ) = FeaturedWidgetEvent(
        id = "e1",
        calendarName = "仕事",
        colorHex = "#0072B2",
        startsAtIso = startsAtIso,
        allDay = allDay,
    )

    // --- maxRowsFor -----------------------------------------------------

    @Test
    fun `小サイズ相当の高さ(40dp)は1件`() {
        assertEquals(1, maxRowsFor(DpSize(180.dp, 40.dp)))
    }

    @Test
    fun `中サイズ未満の境界(109dp)はまだ1件`() {
        assertEquals(1, maxRowsFor(DpSize(180.dp, 109.dp)))
    }

    @Test
    fun `中サイズちょうど(110dp)は2件`() {
        assertEquals(2, maxRowsFor(DpSize(180.dp, 110.dp)))
    }

    @Test
    fun `大サイズ未満の境界(179dp)はまだ2件`() {
        assertEquals(2, maxRowsFor(DpSize(180.dp, 179.dp)))
    }

    @Test
    fun `大サイズちょうど(180dp)は3件`() {
        assertEquals(3, maxRowsFor(DpSize(180.dp, 180.dp)))
    }

    @Test
    fun `大サイズを超えても3件のまま`() {
        assertEquals(3, maxRowsFor(DpSize(180.dp, 226.dp)))
    }

    // --- formatStartLabel -------------------------------------------------

    @Test
    fun `終日は「終日」を返す(startsAtIso の値によらない)`() {
        assertEquals("終日", formatStartLabel(event(startsAtIso = "", allDay = true)))
    }

    @Test
    fun `ミリ秒付きISO(JSブリッジの標準形)をパースする`() {
        val result = formatStartLabel(event(startsAtIso = "2026-09-15T01:30:00.000Z"))
        assertEquals("1:30", result)
    }

    @Test
    fun `ミリ秒無しISO(Supabase PostgREST の標準形)もパースする`() {
        // src/data/events.ts の toEvent() は starts_at をそのまま渡すため、
        // 実データはこの形('...T01:00:00Z')が標準(レビュー指摘、HIGH)。
        val result = formatStartLabel(event(startsAtIso = "2026-09-15T01:30:00Z"))
        assertEquals("1:30", result)
    }

    @Test
    fun `パース不能な文字列は「終日」にフォールバックする`() {
        assertEquals("終日", formatStartLabel(event(startsAtIso = "壊れた日付")))
    }

    @Test
    fun `空文字列も「終日」にフォールバックする`() {
        assertEquals("終日", formatStartLabel(event(startsAtIso = "")))
    }
}

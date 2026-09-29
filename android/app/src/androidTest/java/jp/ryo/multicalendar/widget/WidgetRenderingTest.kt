package jp.ryo.multicalendar.widget

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.TextView
import androidx.compose.ui.graphics.toArgb
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * エミュレータ専用のGlance実描画smoke test。
 * 実データやホームアプリを使わず、AppWidgetHost経由でreceiver→Glance→RemoteViewsを通す。
 */
@RunWith(AndroidJUnit4::class)
class WidgetRenderingTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val appWidgetManager = AppWidgetManager.getInstance(context)
    private val hostId = ("calendar-widget-smoke".hashCode() and 0x7fff) + 1000

    @Test
    fun monthNavigationRendersEventsWithinOneSecond() {
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE in listOf("ranchu", "goldfish"))
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.all
        val host = AppWidgetHost(context, hostId + 1)
        val ids = mutableListOf<Int>()
        val anchor = WidgetDay(2026, 9, 1)
        val now = todayWidgetDay()
        val events = JSONArray().apply {
            repeat(800) { index ->
                val date = addWidgetDays(anchor, index / 5 - 31).toKey()
                put(JSONObject().apply {
                    put("id", "response-$index")
                    put("title", "予定$index")
                    put("calendarName", "検証")
                    put("colorHex", "#0072B2")
                    put("startDate", date)
                    put("endDate", date)
                })
            }
        }
        try {
            prefs.edit().putInt(MONTH_OFFSET_KEY, (2026 - now.year) * 12 + 9 - now.month)
                .putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString())
                .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"light"}""").commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            runOnMain { host.startListening() }
            val view = renderProvider(host, ComponentName(context, MonthEventsWidgetReceiver::class.java), 380, 515, ids, "予定155")
            layoutForAssertions(view, 380, 515)
            assertMonthContents(view, anchor, "予定155")
            assertText(view, "予定158")
            assertText(view, "+1")
            saveBitmap(view, "widget-month-response-september.png", 380, 515)
            // 実際のRemoteViewsのクリックから、ホストへの新しい描画到着までを測る。
            listOf("▲" to WidgetDay(2026, 8, 1), "▼" to anchor,
                "▼" to WidgetDay(2026, 10, 1), "▲" to anchor).forEach { (arrow, month) ->
                val firstEvent = eventsForWidgetDay(readCalendarOverview(context).events, month).first().title
                val started = android.os.SystemClock.elapsedRealtime()
                runOnMain { assertTrue("矢印をクリックできない", clickText(view, arrow)) }
                waitUntil("月切替 ${month.month}") {
                    findText(view, "${month.year}/${month.month}月") && findText(view, firstEvent)
                }
                layoutForAssertions(view, 380, 515)
                assertMonthContents(view, month, firstEvent)
                val elapsed = android.os.SystemClock.elapsedRealtime() - started
                android.util.Log.i("WidgetResponseTest", "month=${month.month} elapsedMs=$elapsed")
                assertTrue("月切替に${elapsed}ms: 1000msを超過", elapsed <= 1000)
                val lastDay = monthGridDays(month.year, month.month).filterNotNull().last()
                val lastEvent = eventsForWidgetDay(readCalendarOverview(context).events, lastDay).first().title
                assertTextViewsFitParent(view, listOf(firstEvent, lastEvent))
                if (month.month == 8) saveBitmap(view, "widget-month-response-august.png", 380, 515)
            }
            // 同一セッション中のアプリ側同期でも、既存の予定名が再読込される。
            events.getJSONObject(155).put("title", "更新予定")
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY,
                JSONObject().put("language", "ja").put("events", events).toString()).commit()
            waitUntil("予定同期") { findText(view, "更新予定") }
        } finally {
            ids.forEach { host.deleteAppWidgetId(it) }
            runOnMain { host.stopListening() }
            instrumentation.uiAutomation.dropShellPermissionIdentity()
            val edit = prefs.edit()
            listOf(CALENDAR_OVERVIEW_KEY, WIDGET_APPEARANCE_KEY).forEach { key ->
                val value = previous[key] as? String
                if (value == null) edit.remove(key) else edit.putString(key, value)
            }
            val oldOffset = previous[MONTH_OFFSET_KEY] as? Int
            if (oldOffset == null) edit.remove(MONTH_OFFSET_KEY) else edit.putInt(MONTH_OFFSET_KEY, oldOffset)
            edit.commit()
        }
    }

    @Test
    fun dayAndWeekKeepCalendarOrderAndLiveUpdates() {
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE in listOf("ranchu", "goldfish"))
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.all
        val host = AppWidgetHost(context, hostId + 2)
        val ids = mutableListOf<Int>()
        val today = todayWidgetDay()
        val first = weekWidgetDays(today).first()
        val events = JSONArray().apply {
            // 同日のカレンダー優先度順を表す。件名や時刻で並べ替えてはいけない。
            for (offset in 0..20) {
                listOf("先頭予定", "後続予定", "補足予定a", "補足予定b", "補足予定c", "補足予定d", "補足予定e", "末尾予定").forEachIndexed { index, title ->
                    val day = addWidgetDays(first, offset)
                    put(JSONObject().put("id", "$offset-$index").put("title", "$title$offset")
                        .put("calendarName", "検証").put("startDate", day.toKey()).put("endDate", day.toKey())
                        .put("allDay", true).put("colorHex", if (index == 0) "#E99A43" else "#3AAE97"))
                }
            }
        }
        try {
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString())
                .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"dark","appFontScale":1}""").commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            runOnMain { host.startListening() }
            val week = renderProvider(host, ComponentName(context, WeekEventsWidgetReceiver::class.java), 380, 180, ids, "先頭予定0")
            val day = renderProvider(host, ComponentName(context, FeaturedEventsWidgetReceiver::class.java), 380, 270, ids, "先頭予定")
            layoutForAssertions(week, 380, 180)
            layoutForAssertions(day, 380, 270)
            assertText(day, "⚙")
            assertText(day, "今日")
            assertTextViewsFitParent(day, listOf("先頭予定", "後続予定", "今日"))
            assertInVerticalOrder(day, "先頭予定", "後続予定")
            assertInVerticalOrder(week, "先頭予定0", "後続予定0")
            waitUntil("一覧末尾へのスクロール") {
                runOnMain { findListView(day)?.let { it.setSelection(it.count - 1) } }
                layoutForAssertions(day, 380, 270)
                findText(day, "末尾予定${weekWidgetDays(today).indexOf(today)}")
            }
            waitUntil("一覧先頭に戻る") {
                runOnMain { findListView(day)?.setSelection(0) }
                layoutForAssertions(day, 380, 270)
                findText(day, "今日")
            }
            saveBitmap(day, "widget-day-agenda.png", 380, 270)
            val smallDay = renderProvider(host, ComponentName(context, FeaturedEventsWidgetReceiver::class.java), 180, 110, ids, "先頭予定")
            assertTextViewsFitParent(smallDay, listOf("⚙", "＋", "先頭予定"))
            saveBitmap(smallDay, "widget-day-small.png", 180, 110)
            val legacyDay = renderProvider(host, ComponentName(context, FeaturedEventsWidgetReceiver::class.java), 180, 40, ids, "先頭予定")
            assertTextViewsFitParent(legacyDay, listOf("＋", "先頭予定"))
            saveBitmap(legacyDay, "widget-day-legacy.png", 180, 40)
            assertTextViewsFitParent(week, listOf(weekHeaderText(weekWidgetDays(today))))
            assertNoEllipsis(week, weekHeaderText(weekWidgetDays(today)))
            saveBitmap(week, "widget-week-unified.png", 380, 180)
            listOf("▼" to 7, "▲" to 0).forEach { (arrow, offset) ->
                val started = android.os.SystemClock.elapsedRealtime()
                runOnMain { assertTrue(clickText(week, arrow)) }
                waitUntil("週移動") { findText(week, "先頭予定$offset") }
                layoutForAssertions(week, 380, 180)
                assertTextViewsFitParent(week, listOf("先頭予定$offset", "後続予定$offset"))
                val elapsed = android.os.SystemClock.elapsedRealtime() - started
                android.util.Log.i("WidgetResponseTest", "week=$offset elapsedMs=$elapsed")
                assertTrue("週切替に${elapsed}ms", elapsed <= 1000)
            }
            val todayIndex = weekWidgetDays(today).indexOf(today)
            listOf("▼" to 1, "▲" to 0).forEach { (arrow, offset) ->
                val started = android.os.SystemClock.elapsedRealtime()
                runOnMain { assertTrue(clickText(day, arrow)) }
                waitUntil("日移動") {
                    layoutForAssertions(day, 380, 270)
                    findText(day, "先頭予定${todayIndex + offset}")
                }
                val elapsed = android.os.SystemClock.elapsedRealtime() - started
                assertTrue("日切替に${elapsed}ms", elapsed <= 1000)
                if (offset != 0) assertTrue("別日の予定が混入", !findText(day, "先頭予定$todayIndex"))
                assertText(smallDay, "先頭予定$todayIndex")
                android.util.Log.i("WidgetResponseTest", "day=$offset elapsedMs=$elapsed")
            }
            // 連続操作と共有データ更新が重なっても、最後の日付から巻き戻らない。
            runOnMain {
                assertTrue(clickText(day, "▼"))
                assertTrue(clickText(day, "▼"))
                assertTrue(clickText(day, "▲"))
            }
            waitUntil("連続操作の最終日") {
                layoutForAssertions(day, 380, 270)
                findText(day, "先頭予定${todayIndex + 1}")
            }
            repeat(20) {
                Thread.sleep(100)
                layoutForAssertions(day, 380, 270)
                assertText(day, "先頭予定${todayIndex + 1}")
                assertTrue("古い日に巻き戻った", !findText(day, "先頭予定$todayIndex"))
            }
            runOnMain { assertTrue(clickText(day, "▲")) }
            waitUntil("今日へ戻る") { layoutForAssertions(day, 380, 270); findText(day, "先頭予定$todayIndex") }
            // アプリで順番を変えた共有データを受け取ると、どちらもその場で並び替わる。
            val reversed = JSONArray()
            for (index in 0 until events.length() step 8) {
                reversed.put(events.getJSONObject(index + 1))
                reversed.put(events.getJSONObject(index))
                for (extra in 2..7) reversed.put(events.getJSONObject(index + extra))
            }
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", reversed).toString()).commit()
            waitUntil("日・週の並び順更新") {
                layoutForAssertions(day, 380, 270)
                layoutForAssertions(week, 380, 180)
                isInVerticalOrder(day, "後続予定", "先頭予定") && isInVerticalOrder(week, "後続予定0", "先頭予定0")
            }
            // 実際のRemoteViewsから起動したActivityのURLを確認する。
            val firstId = dayAgendaEvents(readCalendarOverview(context).events, today).first().id
            listOf(
                today.day.toString() to "calendar-app://day/${today.toKey()}",
                "後続予定" to "calendar-app://event/$firstId",
                "⚙" to "calendar-app://settings/",
                "＋" to "calendar-app://create/${today.toKey()}",
            ).forEach { (text, expectedUrl) ->
                runOnMain {
                    androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                        .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED).toList().forEach { it.finish() }
                }
                instrumentation.waitForIdleSync()
                runOnMain { assertTrue("日の操作をクリックできない: $text", clickContainingText(day, text)) }
                waitUntil("起動リンク: $expectedUrl") {
                    runOnMain {
                        androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                            .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED)
                            .any { it.intent?.data?.toString() == expectedUrl }
                    }
                }
            }
            runOnMain {
                androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED).toList().forEach { it.finish() }
            }
        } finally {
            ids.forEach { host.deleteAppWidgetId(it) }
            runOnMain { host.stopListening() }
            instrumentation.uiAutomation.dropShellPermissionIdentity()
            val edit = prefs.edit()
            listOf(CALENDAR_OVERVIEW_KEY, WIDGET_APPEARANCE_KEY).forEach { key ->
                (previous[key] as? String)?.let { edit.putString(key, it) } ?: edit.remove(key)
            }
            edit.commit()
        }
    }

    @Test
    fun allWidgetsNavigateAfterIdleWithinOneSecond() {
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE in listOf("ranchu", "goldfish"))
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.all
        val host = AppWidgetHost(context, hostId + 3)
        val ids = mutableListOf<Int>()
        val today = todayWidgetDay()
        val events = JSONArray().apply {
            repeat(800) { index ->
                val date = addWidgetDays(today, index / 5 - 50).toKey()
                put(JSONObject().put("id", "idle-$index").put("title", "検証$index")
                    .put("calendarName", "検証").put("startDate", date).put("endDate", date)
                    .put("allDay", true).put("colorHex", "#0072B2"))
            }
        }
        try {
            prefs.edit().putInt(MONTH_OFFSET_KEY, 0)
                .putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString())
                .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"dark","appFontScale":1}""").commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            runOnMain { host.startListening() }
            val overview = readCalendarOverview(context)
            fun title(date: WidgetDay) = eventsForWidgetDay(overview.events, date).first().title
            val month = renderProvider(host, ComponentName(context, MonthEventsWidgetReceiver::class.java), 380, 515, ids, title(monthAnchor(today, 0)))
            val week = renderProvider(host, ComponentName(context, WeekEventsWidgetReceiver::class.java), 380, 180, ids, title(weekWidgetDays(today).first()))
            val day = renderProvider(host, ComponentName(context, FeaturedEventsWidgetReceiver::class.java), 384, 170, ids, title(today))
            // 稼働中セッションだけの測定にせず、45秒の描画セッション終了を待つ。
            android.util.Log.i("WidgetResponseTest", "idleWaitStarted")
            Thread.sleep(55_000)
            val targets = listOf(
                Triple(month, 515, monthAnchor(today, 1)),
                Triple(week, 180, addWidgetDays(weekWidgetDays(today).first(), 7)),
                Triple(day, 170, addWidgetDays(today, 1)),
            )
            targets.forEachIndexed { index, (view, height, nextDate) ->
                val started = android.os.SystemClock.elapsedRealtime()
                runOnMain { assertTrue(clickText(view, "▼")) }
                waitUntil("非操作後の切替$index") {
                    layoutForAssertions(view, if (index == 2) 384 else 380, height)
                    findText(view, title(nextDate))
                }
                assertTextViewsFitParent(view, listOf(title(nextDate)))
                val elapsed = android.os.SystemClock.elapsedRealtime() - started
                android.util.Log.i("WidgetResponseTest", "idleKind=$index elapsedMs=$elapsed")
                if (index != 2 || android.os.Build.VERSION.SDK_INT >= 31) {
                    assertTrue("非操作後の切替$index: ${elapsed}ms", elapsed <= 1000)
                }
                repeat(10) {
                    Thread.sleep(100)
                    layoutForAssertions(view, if (index == 2) 384 else 380, height)
                    assertText(view, title(nextDate))
                }
            }
        } finally {
            ids.forEach { host.deleteAppWidgetId(it) }
            runOnMain { host.stopListening() }
            instrumentation.uiAutomation.dropShellPermissionIdentity()
            val edit = prefs.edit()
            listOf(CALENDAR_OVERVIEW_KEY, WIDGET_APPEARANCE_KEY).forEach { key ->
                (previous[key] as? String)?.let { edit.putString(key, it) } ?: edit.remove(key)
            }
            (previous[MONTH_OFFSET_KEY] as? Int)?.let { edit.putInt(MONTH_OFFSET_KEY, it) } ?: edit.remove(MONTH_OFFSET_KEY)
            edit.commit()
        }
    }

    private fun findListView(view: View): android.widget.ListView? {
        if (view is android.widget.ListView) return view
        if (view is android.view.ViewGroup) for (i in 0 until view.childCount) findListView(view.getChildAt(i))?.let { return it }
        return null
    }

    private fun assertNoEllipsis(view: View, text: String) {
        if (view is TextView && view.text.toString() == text) {
            val layout = view.layout ?: error("文字レイアウトがない")
            for (line in 0 until layout.lineCount) assertTrue("見出しが省略された: $text", layout.getEllipsisCount(line) == 0)
        }
        if (view is android.view.ViewGroup) for (i in 0 until view.childCount) assertNoEllipsis(view.getChildAt(i), text)
    }

    private fun isInVerticalOrder(view: View, first: String, second: String): Boolean {
        val boxes = mutableListOf<TextBox>()
        collectTextViews(view, boxes, -view.left, -view.top)
        val before = boxes.firstOrNull { it.text.contains(first) } ?: return false
        val after = boxes.firstOrNull { it.text.contains(second) } ?: return false
        return before.top < after.top
    }

    private fun assertInVerticalOrder(view: View, first: String, second: String) {
        assertTrue("予定順が違う: $first → $second", isInVerticalOrder(view, first, second))
    }

    private fun clickContainingText(view: View, text: String): Boolean {
        if (view is TextView && view.text.toString().contains(text)) {
            var target: View? = view
            while (target != null && !target.isClickable) target = target.parent as? View
            return target?.performClick() ?: false
        }
        if (view is android.view.ViewGroup) for (index in 0 until view.childCount) {
            if (clickContainingText(view.getChildAt(index), text)) return true
        }
        return false
    }

    private fun clickText(view: View, text: String): Boolean {
        if (view is TextView && view.text.toString() == text) {
            var target: View? = view
            while (target != null && !target.isClickable) target = target.parent as? View
            return target?.performClick() ?: error("クリック対象がない: $text")
        }
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) if (clickText(view.getChildAt(index), text)) return true
        }
        return false
    }

    private fun assertMonthContents(view: View, month: WidgetDay, title: String) {
        val boxes = mutableListOf<TextBox>()
        collectTextViews(view, boxes, -view.left, -view.top)
        monthGridDays(month.year, month.month).filterNotNull().forEach { day ->
            assertTrue("日付${day.day}の欠落", boxes.any {
                it.text == day.day.toString() && it.top >= 0 && it.bottom > it.top &&
                    it.right > it.left && it.bottom <= view.height
            })
        }
        assertTrue("予定が画面外または高さゼロ: $title", boxes.any {
            it.text.contains(title) && it.bottom > it.top && it.right > it.left && it.top >= 0 && it.bottom <= view.height
        })
        assertTrue("予定色が違う", findTextColor(view, title) == android.graphics.Color.parseColor("#0072B2"))
    }

    private fun findTextColor(view: View, text: String): Int? {
        if (view is TextView && view.text.toString().contains(text)) return view.currentTextColor
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) findTextColor(view.getChildAt(index), text)?.let { return it }
        }
        return null
    }

    @Test
    fun weekAndMonthWidgetsRenderFixtureWithoutRuntimeCrash() {
        // 接続実機を含む一括実行でも、データ差し替えはエミュレータだけに限定する。
        org.junit.Assume.assumeTrue(
            "エミュレータ専用の描画確認",
            android.os.Build.HARDWARE in listOf("ranchu", "goldfish"),
        )
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.getString(CALENDAR_OVERVIEW_KEY, null)
        val previousAppearance = prefs.getString(WIDGET_APPEARANCE_KEY, null)
        val today = todayWidgetDay()
        val todayKey = today.toKey()
        val title = "検証予定"
        val secondTitle = "二件目"
        val thirdTitle = "三件目"
        val fixture = JSONObject().apply {
            put("schemaVersion", 1)
            put("updatedAtIso", "2026-01-01T00:00:00.000Z")
            put("language", "en")
            put("events", JSONArray().apply {
                listOf(title, secondTitle, thirdTitle).forEachIndexed { index, eventTitle ->
                    put(JSONObject().apply {
                        put("id", "widget-smoke-event-$index")
                        put("title", eventTitle)
                        put("calendarName", "Widget smoke")
                        put("colorHex", "#0072B2")
                        put("startDate", todayKey)
                        put("endDate", todayKey)
                        put("startsAtIso", "2026-01-01T00:00:00.000Z")
                        put("allDay", true)
                    })
                }
            })
        }
        val host = AppWidgetHost(context, hostId)
        val boundIds = mutableListOf<Int>()
        var adopted = false
        try {
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY, fixture.toString()).commit()
            prefs.edit().putString(WIDGET_APPEARANCE_KEY,
                """{"schemaVersion":1,"theme":"lavender","backgroundColor":"#fbf8ff","primaryTextColor":"#302641","accentColor":"#7042a8","appFontScale":1}""").commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity(
                "android.permission.BIND_APPWIDGET",
            )
            adopted = true
            host.startListening()
            val week = renderProvider(
                host,
                ComponentName(context, WeekEventsWidgetReceiver::class.java),
                180,
                140,
                boundIds,
                title,
            )
            layoutForAssertions(week, 180, 140)
            saveBitmap(week, "widget-week.png", 180, 140)
            assertWeekHasOnlyHeaderAddButton(week)
            // 5週・6週のどちらでも、1日2件と超過1件を描くセル高を確保する。
            val minimumHeight = 56 + (monthWidgetDays(today).size / 7) * 44
            val monthMin = renderProvider(
                host,
                ComponentName(context, MonthEventsWidgetReceiver::class.java),
                250,
                minimumHeight,
                boundIds,
                title,
            )
            layoutForAssertions(monthMin, 250, minimumHeight)
            assertPlus(monthMin)
            assertText(monthMin, title)
            assertText(monthMin, secondTitle)
            assertText(monthMin, "+1")
            assertTextViewsFitParent(monthMin, listOf(title, secondTitle, "+1"))
            saveBitmap(monthMin, "widget-month-min.png", 250, minimumHeight)

            val month = renderProvider(
                host,
                ComponentName(context, MonthEventsWidgetReceiver::class.java),
                250,
                420,
                boundIds,
                title,
            )

            layoutForAssertions(month, 250, 420)
            assertPlus(week)
            assertText(week, title)
            assertText(week, secondTitle)
            assertText(week, thirdTitle)
            assertText(week, today.day.toString())
            assertPlus(month)
            assertText(month, title)
            assertText(month, secondTitle)
            assertText(month, thirdTitle)
            assertText(month, today.day.toString())
            assertTextViewsFitParent(month, listOf(title, secondTitle, thirdTitle))
            saveBitmap(month, "widget-month.png", 250, 420)
        } finally {
            boundIds.forEach { host.deleteAppWidgetId(it) }
            runOnMain { host.stopListening() }
            if (adopted) instrumentation.uiAutomation.dropShellPermissionIdentity()
            val edit = prefs.edit()
            if (previous == null) edit.remove(CALENDAR_OVERVIEW_KEY) else edit.putString(CALENDAR_OVERVIEW_KEY, previous)
            if (previousAppearance == null) edit.remove(WIDGET_APPEARANCE_KEY) else edit.putString(WIDGET_APPEARANCE_KEY, previousAppearance)
            edit.commit()
        }
    }

    @Test
    fun mixedLocalAndExternalLabelsRenderTintedRoundedBackgroundsWithinMonthBounds() {
        org.junit.Assume.assumeTrue(
            "エミュレータ専用の描画確認",
            android.os.Build.HARDWARE in listOf("ranchu", "goldfish"),
        )
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.all
        val today = todayWidgetDay()
        val localColor = android.graphics.Color.parseColor("#F59E0B")
        val externalColor = android.graphics.Color.parseColor("#0072B2")
        val events = JSONArray().apply {
            repeat(800) { index ->
                val date = addWidgetDays(today, index / 5 - 31).toKey()
                put(JSONObject().apply {
                    put("id", "label-$index")
                    put("title", when (index) {
                        157 -> "会議予定長め"
                        156 -> "確認予定長め"
                        else -> "ラベル$index"
                    })
                    put("calendarName", "混在検証")
                    put("colorHex", if (index % 2 == 0) "#F59E0B" else "#0072B2")
                    put("startDate", date)
                    put("endDate", date)
                    put("allDay", true)
                    put("source", if (index % 2 == 0) "local" else "external")
                    put("filledLabel", index % 2 == 0)
                })
            }
        }
        val host = AppWidgetHost(context, hostId + 4)
        val boundIds = mutableListOf<Int>()
        var adopted = false
        try {
            prefs.edit().putInt(MONTH_OFFSET_KEY, 0)
                .putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString())
                .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"light","appFontScale":1.2}""").commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            adopted = true
            host.startListening()
            val week = renderProvider(host, ComponentName(context, WeekEventsWidgetReceiver::class.java), 380, 180, boundIds, "ラベル155")
            val month = renderProvider(host, ComponentName(context, MonthEventsWidgetReceiver::class.java), 380, 515, boundIds, "ラベル155")
            val day = renderProvider(host, ComponentName(context, FeaturedEventsWidgetReceiver::class.java), 380, 270, boundIds, "ラベル155")
            layoutForAssertions(week, 380, 180)
            layoutForAssertions(month, 380, 515)
            layoutForAssertions(day, 380, 270)
            saveBitmap(month, "widget-label-month-inspect.png", 380, 515)
            assertLabelRendering(week, "確認予定長め", true, localColor)
            assertLabelRendering(week, "ラベル155", false, externalColor)
            assertLabelRendering(month, "確認予定長め", true, localColor)
            assertLabelRendering(month, "ラベル155", false, externalColor)
            assertLabelRendering(day, "確認予定長め", true, localColor)
            assertLabelRendering(day, "ラベル155", false, externalColor, android.graphics.Color.parseColor("#1A1C1E"))
            val lastDay = monthGridDays(today.year, today.month).filterNotNull().last()
            val lastEvent = eventsForWidgetDay(readCalendarOverview(context).events, lastDay).first()
            assertTrue("月末予定が画面外または高さゼロ", findBoundedText(month, lastEvent.title))
            saveBitmap(week, "widget-label-week.png", 380, 180)
            saveBitmap(month, "widget-label-month.png", 380, 515)
            saveBitmap(day, "widget-label-day.png", 380, 270)
            // 狭い7列でも、日本語の先頭4文字とフォントの上下が予定行へ収まる。
            listOf(Triple(WeekEventsWidgetReceiver::class.java, 320, 180), Triple(MonthEventsWidgetReceiver::class.java, 320, 515),
                Triple(WeekEventsWidgetReceiver::class.java, 180, 180), Triple(MonthEventsWidgetReceiver::class.java, 250, 515)).forEach { (receiver, width, height) ->
                val narrow = renderProvider(host, ComponentName(context, receiver), width, height, boundIds, "確認予定")
                layoutForAssertions(narrow, width, height)
                assertFourTitleCharactersFit(narrow, "会議予定")
                assertFourTitleCharactersFit(narrow, "確認予定")
            }
            repeat(events.length()) { index -> events.getJSONObject(index).put("filledLabel", true) }
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString()).commit()
            events.getJSONObject(155).put("title", "全自作155")
            prefs.edit().putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString()).commit()
            waitUntil("全予定を自作ラベルで表示") { findText(month, "全自作155") }
            layoutForAssertions(month, 380, 515)
            assertTrue("全自作でも月末を表示", findBoundedText(month, lastEvent.title))
            val nextMonth = monthAnchor(today, 1)
            val nextTitle = eventsForWidgetDay(readCalendarOverview(context).events, nextMonth).first().title
            val started = android.os.SystemClock.elapsedRealtime()
            runOnMain { assertTrue(clickText(month, "▼")) }
            waitUntil("色付きラベルの翌月") { findText(month, "${nextMonth.year}/${nextMonth.month}月") && findText(month, nextTitle) }
            layoutForAssertions(month, 380, 515)
            val elapsed = android.os.SystemClock.elapsedRealtime() - started
            android.util.Log.i("WidgetResponseTest", "filledLabels elapsedMs=$elapsed")
            assertTrue("色付きラベルの月移動に${elapsed}ms", elapsed <= 1000)


        } finally {
            boundIds.forEach { host.deleteAppWidgetId(it) }
            runOnMain { host.stopListening() }
            if (adopted) instrumentation.uiAutomation.dropShellPermissionIdentity()
            val edit = prefs.edit()
            (previous[CALENDAR_OVERVIEW_KEY] as? String)?.let { edit.putString(CALENDAR_OVERVIEW_KEY, it) } ?: edit.remove(CALENDAR_OVERVIEW_KEY)
            (previous[WIDGET_APPEARANCE_KEY] as? String)?.let { edit.putString(WIDGET_APPEARANCE_KEY, it) } ?: edit.remove(WIDGET_APPEARANCE_KEY)
            (previous[MONTH_OFFSET_KEY] as? Int)?.let { edit.putInt(MONTH_OFFSET_KEY, it) } ?: edit.remove(MONTH_OFFSET_KEY)
            edit.commit()
        }
    }

    private fun assertFourTitleCharactersFit(root: View, title: String) {
        val view = findTextView(root, title) ?: error("予定の文字がない: $title")
        val layout = view.layout ?: error("予定のレイアウトがない: $title")
        assertTrue("$title が親領域からはみ出している", findBoundedText(root, title))
        val contentHeight = view.height - view.totalPaddingTop - view.totalPaddingBottom
        assertTrue("$title の文字下端が切れる: ${layout.height} > $contentHeight", layout.height <= contentHeight)
        val prefixLength = view.text.toString().indexOf(title)
        assertTrue("$title の4文字目が省略された", layout.getEllipsisCount(0) == 0 || layout.getEllipsisStart(0) >= prefixLength + 4)
    }

    private fun assertLabelRendering(root: View, title: String, filled: Boolean, backgroundColor: Int, externalTextColor: Int = backgroundColor) {
        val textView = findTextView(root, title) ?: error("text '$title' was not rendered")
        val expectedTextColor = if (filled) {
            widgetFilledLabelTextColor(widgetEventColor(String.format("#%06X", backgroundColor and 0xFFFFFF), androidx.compose.ui.graphics.Color.White)).toArgb()
        } else externalTextColor
        assertTrue("$title の文字色が違う", textView.currentTextColor == expectedTextColor)
        // Glanceは画像背景を兄弟ImageViewへ展開する。最終描画の件名右端を検査する。
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        runOnMain { root.draw(Canvas(bitmap)) }
        var left = textView.left
        var top = textView.top
        var parent = textView.parent as? View
        while (parent != null && parent !== root) {
            left += parent.left - parent.scrollX
            top += parent.top - parent.scrollY
            parent = parent.parent as? View
        }
        val x = (left + textView.width - 5).coerceIn(0, bitmap.width - 1)
        val y = (top + textView.height / 2).coerceIn(0, bitmap.height - 1)
        val renderedBackground = bitmap.getPixel(x, y)
        if (filled) {
            assertTrue("$title の背景色が違う: $renderedBackground", renderedBackground == backgroundColor)
        } else {
            assertTrue("外部予定まで背景塗りされた: $title", renderedBackground != backgroundColor)
        }
    }

    private fun findTextView(view: View, expected: String): TextView? {
        if (view is TextView && view.text?.toString()?.contains(expected) == true) return view
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) findTextView(view.getChildAt(index), expected)?.let { return it }
        }
        return null
    }

    private fun renderProvider(
        host: AppWidgetHost,
        provider: ComponentName,
        widthDp: Int,
        heightDp: Int,
        boundIds: MutableList<Int>,
        expectedTitle: String,
    ): AppWidgetHostView {
        val id = runOnMain { host.allocateAppWidgetId() }
        boundIds += id
        assertTrue("bindAppWidgetIdIfAllowed failed for $provider", appWidgetManager.bindAppWidgetIdIfAllowed(id, provider))
        val info = appWidgetManager.getAppWidgetInfo(id)
        assertNotNull("provider info missing for $provider", info)
        val providerInfo = info ?: error("provider info missing for $provider")
        val options = android.os.Bundle().apply {
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp)
        }
        appWidgetManager.updateAppWidgetOptions(id, options)
        // optionsはウィジェット内容のサイズ。検証ホストの既定余白を二重に差し引かない。
        val view = runOnMain { host.createView(context, id, providerInfo).apply { setPadding(0, 0, 0, 0) } }
        val update = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
            component = provider
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(id))
        }
        context.sendBroadcast(update)
        waitUntil("RemoteViews update for $provider") {
            layoutForAssertions(view, widthDp, heightDp)
            view.childCount > 0 && (findText(view, "＋") || findText(view, "+")) && findText(view, expectedTitle)
        }
        return view
    }

    private fun assertText(root: View, expected: String) {
        assertTrue("text '$expected' was not rendered", findText(root, expected))
    }

    private fun assertTextViewsFitParent(root: View, expected: List<String>) {
        expected.forEach { text ->
            assertTrue("text '$text' has no bounded TextView", findBoundedText(root, text))
        }
    }

    private fun findBoundedText(view: View, expected: String): Boolean {
        if (view is TextView && view.text?.toString()?.contains(expected) == true) {
            if (view.width <= 0 || view.height <= 0) return false
            var left = view.left
            var top = view.top
            var parent = view.parent as? View ?: return false
            while (true) {
                if (left < 0 || top < 0 || left + view.width > parent.width || top + view.height > parent.height) return false
                left += parent.left - parent.scrollX
                top += parent.top - parent.scrollY
                parent = parent.parent as? View ?: return true
            }
        }
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) {
                if (findBoundedText(view.getChildAt(index), expected)) return true
            }
        }
        return false
    }

    private fun assertPlus(root: View) {
        assertTrue("text '＋' was not rendered", findText(root, "＋") || findText(root, "+"))
    }

    private fun assertWeekHasOnlyHeaderAddButton(root: View) {
        val textViews = mutableListOf<TextBox>()
        // ウィンドウ未接続の描画用Viewなので、親からの配置座標を積算する。
        collectTextViews(root, textViews, -root.left, -root.top)
        val addButtons = textViews.filter { it.text == "＋" || it.text == "+" }
        assertTrue("週の日付ごとの追加ボタンが残っている: $addButtons", addButtons.size == 1)
    }

    private data class TextBox(val text: String, val left: Int, val top: Int, val right: Int, val bottom: Int)

    private fun collectTextViews(view: View, result: MutableList<TextBox>, parentLeft: Int, parentTop: Int) {
        val left = parentLeft + view.left
        val top = parentTop + view.top
        if (view is TextView) {
            result += TextBox(view.text?.toString().orEmpty(), left, top, left + view.width, top + view.height)
        }
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) collectTextViews(view.getChildAt(index), result, left - view.scrollX, top - view.scrollY)
        }
    }

    private fun findText(view: View, expected: String): Boolean {
        if (view is TextView && view.text?.toString()?.contains(expected) == true) return true
        if (view is android.view.ViewGroup) {
            for (index in 0 until view.childCount) if (findText(view.getChildAt(index), expected)) return true
        }
        return false
    }

    private fun saveBitmap(view: AppWidgetHostView, name: String, widthDp: Int, heightDp: Int) {
        runOnMain {
            layoutView(view, widthDp, heightDp)
            val width = view.width
            val height = view.height
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            FileOutputStream(File(context.cacheDir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    private fun layoutForAssertions(view: AppWidgetHostView, widthDp: Int, heightDp: Int) {
        runOnMain { layoutView(view, widthDp, heightDp) }
    }

    private fun layoutView(view: AppWidgetHostView, widthDp: Int, heightDp: Int) {
        val density = context.resources.displayMetrics.density
        val width = (widthDp * density).toInt().coerceAtLeast(view.width)
        val height = (heightDp * density).toInt().coerceAtLeast(view.height)
        view.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, width, height)
    }

    private fun waitUntil(label: String, condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            instrumentation.waitForIdleSync()
            if (condition()) return
            Thread.sleep(100)
        }
        assertTrue("timeout: $label", condition())
    }

    private fun <T> runOnMain(block: () -> T): T {
        var result: T? = null
        instrumentation.runOnMainSync { result = block() }
        @Suppress("UNCHECKED_CAST")
        return result as T
    }
}

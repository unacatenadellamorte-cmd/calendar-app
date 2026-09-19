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
    fun weekAndMonthWidgetsRenderFixtureWithoutRuntimeCrash() {
        // 接続実機を含む一括実行でも、データ差し替えはエミュレータだけに限定する。
        org.junit.Assume.assumeTrue(
            "エミュレータ専用の描画確認",
            android.os.Build.HARDWARE in listOf("ranchu", "goldfish"),
        )
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.getString(CALENDAR_OVERVIEW_KEY, null)
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
            val monthMin = renderProvider(
                host,
                ComponentName(context, MonthEventsWidgetReceiver::class.java),
                250,
                280,
                boundIds,
                title,
            )
            layoutForAssertions(monthMin, 250, 280)
            assertPlus(monthMin)
            assertText(monthMin, title)
            assertText(monthMin, secondTitle)
            assertText(monthMin, "+1")
            assertTextViewsFitParent(monthMin, listOf(title, secondTitle, "+1"))
            saveBitmap(monthMin, "widget-month-min.png", 250, 280)

            val month = renderProvider(
                host,
                ComponentName(context, MonthEventsWidgetReceiver::class.java),
                250,
                420,
                boundIds,
                title,
            )

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
            edit.commit()
        }
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
        val view = runOnMain { host.createView(context, id, providerInfo) }
        val update = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
            component = provider
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(id))
        }
        context.sendBroadcast(update)
        waitUntil("RemoteViews update for $provider") {
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
            val parent = view.parent as? View
            return parent != null && view.left >= 0 && view.top >= 0 &&
                view.right <= parent.width && view.bottom <= parent.height
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

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
import java.util.concurrent.TimeUnit
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** ストア素材用。実装のreceiver→Glance→RemoteViewsだけを通してPNGを保存する。 */
@RunWith(AndroidJUnit4::class)
class StoreCaptureTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val manager = AppWidgetManager.getInstance(context)
    private val hostId = ("calendar-store-capture-20260926".hashCode() and 0x7fff) + 3100

    @Test
    fun captureSeptemberStoreWidgets() {
        assumeTrue(android.os.Build.HARDWARE in listOf("ranchu", "goldfish"))
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        val previous = prefs.all
        val host = AppWidgetHost(context, hostId)
        val ids = mutableListOf<Int>()
        val events = fixtureEvents()
        val previousTimezone = TimeZone.getDefault()
        try {
            // 撮影基準日を日本時間の2026/9/26に固定する（端末のシステム設定は変更しない）。
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"))
            prefs.edit()
                .putInt(MONTH_OFFSET_KEY, 0)
                .putString(CALENDAR_OVERVIEW_KEY, JSONObject().put("language", "ja").put("events", events).toString())
                .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"light","appFontScale":1}""")
                .commit()
            instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
            runOnMain { host.startListening() }

            val month = renderProvider(host, MonthEventsWidgetReceiver::class.java, 380, 515, ids, "朝会")
            saveBitmap(month, "20260926_multi-calendar_raw-widget-month.png", 380, 515)

            val week = renderProvider(host, WeekEventsWidgetReceiver::class.java, 380, 180, ids, "朝会")
            assertTrue("週の9/26予定がない", findText(week, "朝会"))
            saveBitmap(week, "20260926_multi-calendar_raw-widget-week.png", 380, 180)

            val day = renderProvider(host, FeaturedEventsWidgetReceiver::class.java, 380, 270, ids, "朝会")
            // 実todayが9/25なら、撮影対象の9/26へ進める。9/26環境では初期表示を使う。
            repeat(8) {
                if (findText(day, "朝会")) return@repeat
                runOnMain { assertTrue("日ウィジェットの次日操作に失敗", clickText(day, "▼")) }
                Thread.sleep(250)
            }
            waitUntil("9/26の日ウィジェット更新") { findText(day, "朝会") }
            saveBitmap(day, "20260926_multi-calendar_raw-widget-day.png", 380, 270)
            assertTrue("日ウィジェットにランチがない", findText(day, "ランチ"))
            assertTrue("日ウィジェットに読書がない", findText(day, "読書"))
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
            TimeZone.setDefault(previousTimezone)
        }
    }

    private fun fixtureEvents(): JSONArray {
        val rows = listOf(
            Triple("2026-09-26", "朝会", "#2563EB"), Triple("2026-09-26", "ランチ", "#F59E0B"),
            Triple("2026-09-26", "読書", "#8B5CF6"), Triple("2026-09-02", "買い物", "#10B981"),
            Triple("2026-09-04", "散歩", "#EC4899"), Triple("2026-09-07", "早番", "#06B6D4"),
            Triple("2026-09-10", "会議", "#EF4444"), Triple("2026-09-12", "映画", "#F97316"),
            Triple("2026-09-15", "通院", "#14B8A6"), Triple("2026-09-18", "料理", "#A855F7"),
            Triple("2026-09-21", "散歩", "#22C55E"), Triple("2026-09-23", "買い物", "#E11D48"),
            Triple("2026-09-28", "会議", "#0EA5E9"), Triple("2026-09-30", "読書", "#7C3AED"),
        )
        return JSONArray().apply {
            rows.forEachIndexed { index, (date, title, color) ->
                // ISOはUTCで保存されるため、日本時間9/26の09/12/18時をUTCへ変換。
                val time = when (title) { "朝会" -> "00:00"; "ランチ" -> "03:00"; "読書" -> "09:00"; else -> "01:00" }
                val end = when (title) { "朝会" -> "01:00"; "ランチ" -> "04:00"; "読書" -> "10:00"; else -> "02:00" }
                put(JSONObject().apply {
                    put("id", "store-$index"); put("title", title); put("calendarName", "予定")
                    put("colorHex", color); put("startDate", date); put("endDate", date)
                    put("startsAtIso", "${date}T${time}:00Z"); put("endsAtIso", "${date}T${end}:00Z")
                    put("allDay", false); put("filledLabel", true)
                })
            }
            // 外部予定は青い左バーだけを残す。
            put(JSONObject().apply {
                put("id", "store-external"); put("title", "外部予定"); put("calendarName", "共有")
                put("colorHex", "#2563EB"); put("startDate", "2026-09-26"); put("endDate", "2026-09-26")
                put("startsAtIso", "2026-09-26T06:00:00Z"); put("endsAtIso", "2026-09-26T07:00:00Z")
                put("allDay", false); put("filledLabel", false)
            })
        }
    }

    private fun renderProvider(host: AppWidgetHost, receiver: Class<*>, widthDp: Int, heightDp: Int, ids: MutableList<Int>, expected: String): AppWidgetHostView {
        val id = runOnMain { host.allocateAppWidgetId() }; ids += id
        val provider = ComponentName(context, receiver)
        assertTrue("bind失敗: $receiver", manager.bindAppWidgetIdIfAllowed(id, provider))
        val info = manager.getAppWidgetInfo(id) ?: error("provider info missing: $receiver")
        manager.updateAppWidgetOptions(id, android.os.Bundle().apply {
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp); putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp); putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp)
        })
        val view = runOnMain { host.createView(context, id, info).apply { setPadding(0, 0, 0, 0) } }
        context.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply { component = provider; putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(id)) })
        waitUntil("描画更新: $receiver") { layoutView(view, widthDp, heightDp); view.childCount > 0 && findText(view, expected) }
        return view
    }

    private fun saveBitmap(view: AppWidgetHostView, name: String, widthDp: Int, heightDp: Int) = runOnMain {
        layoutView(view, widthDp, heightDp)
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap)); FileOutputStream(File(context.cacheDir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun clickText(view: View, text: String): Boolean {
        if (view is TextView && view.text.toString() == text) {
            var target: View? = view; while (target != null && !target.isClickable) target = target.parent as? View
            return target?.performClick() ?: false
        }
        if (view is android.view.ViewGroup) for (i in 0 until view.childCount) if (clickText(view.getChildAt(i), text)) return true
        return false
    }

    private fun findText(view: View, text: String): Boolean {
        if (view is TextView && view.text.toString().contains(text)) return true
        if (view is android.view.ViewGroup) for (i in 0 until view.childCount) if (findText(view.getChildAt(i), text)) return true
        return false
    }

    private fun layoutView(view: AppWidgetHostView, widthDp: Int, heightDp: Int) {
        val density = context.resources.displayMetrics.density
        val width = (widthDp * density).toInt(); val height = (heightDp * density).toInt()
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)); view.layout(0, 0, width, height)
    }

    private fun waitUntil(label: String, condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
        while (System.nanoTime() < deadline) { instrumentation.waitForIdleSync(); if (condition()) return; Thread.sleep(100) }
        assertTrue("timeout: $label", condition())
    }

    private fun <T> runOnMain(block: () -> T): T {
        var result: T? = null; instrumentation.runOnMainSync { result = block() }
        @Suppress("UNCHECKED_CAST") return result as T
    }
}

package jp.ryo.multicalendar.widget

import android.content.Context
import androidx.compose.ui.graphics.toArgb
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assume.assumeTrue

/** 実端末のContext/SharedPreferencesを通した外観JSONの読み出しを検証する。 */
@RunWith(AndroidJUnit4::class)
class WidgetAppearanceInstrumentedTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private var previous: String? = null
    private var captured = false

    @Before
    fun setUp() {
        assumeTrue("エミュレータ専用", android.os.Build.HARDWARE in listOf("ranchu", "goldfish"))
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        previous = prefs.getString(WIDGET_APPEARANCE_KEY, null)
        captured = true
    }

    @After
    fun tearDown() {
        if (!captured) return
        val edit = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE).edit()
        if (previous == null) edit.remove(WIDGET_APPEARANCE_KEY) else edit.putString(WIDGET_APPEARANCE_KEY, previous)
        edit.commit()
    }

    @Test
    fun savedAppearanceIsReadFromSharedPreferences() {
        context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE).edit()
            .putString(WIDGET_APPEARANCE_KEY, """
                {"schemaVersion":1,"theme":"dark","backgroundColor":"#123456","accentColor":"#654321","appFontScale":1.2}
            """.trimIndent()).commit()

        val appearance = readWidgetAppearance(context)
        assertEquals(0xFF123456.toInt(), appearance.backgroundColor.toArgb())
        assertEquals(1.2f, appearance.appFontScale, 0.001f)
    }

    @Test
    fun paletteThemeKeepsSavedColors() {
        context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE).edit()
            .putString(WIDGET_APPEARANCE_KEY, """{"schemaVersion":1,"theme":"sakura","backgroundColor":"#fff8fa","accentColor":"#a52c62","appFontScale":0.8}""").commit()
        val appearance = readWidgetAppearance(context)
        assertEquals(0xFFFFF8FA.toInt(), appearance.backgroundColor.toArgb())
        assertEquals(0xFFA52C62.toInt(), appearance.accentColor.toArgb())
    }

    @Test
    fun invalidOrUnknownVersionFallsBackSafely() {
        val prefs = context.getSharedPreferences(WIDGET_GROUP, Context.MODE_PRIVATE)
        prefs.edit().putString(WIDGET_APPEARANCE_KEY, "壊れたJSON").commit()
        assertEquals(0xFFFFFFFF.toInt(), readWidgetAppearance(context).backgroundColor.toArgb())
        prefs.edit().putString(WIDGET_APPEARANCE_KEY, "{\"schemaVersion\":99,\"theme\":\"dark\"}").commit()
        assertEquals(0xFFFFFFFF.toInt(), readWidgetAppearance(context).backgroundColor.toArgb())
    }
}

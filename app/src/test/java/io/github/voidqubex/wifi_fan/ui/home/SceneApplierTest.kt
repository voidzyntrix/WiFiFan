package io.github.voidqubex.wifi_fan.ui.home

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.github.voidqubex.wifi_fan.SettingsStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class SceneApplierTest {
    private val solid = LedState(
        mode = LED_MODE_SOLID, hue = 30f, sat = 1f, kelvinMode = false, kelvin = 4000f, bri = 0.6f,
        candleHue = null, separate = false, hue2 = 210f, sat2 = 1f, kelvinMode2 = false, kelvin2 = 4000f
    )
    private val opts = LedOptions(smoothCandle = false, candleHue = 19, twoCandles = false, rainbowSeconds = 15)
    private val night = DefaultScenes.first { it.name == "Night" }
    private val read = DefaultScenes.first { it.name == "Read" }

    private fun cmds(scene: Scene, from: LedState, fw: String): Pair<List<String>, LedState> {
        val caps = BoardCaps.of(fw)
        val (next, _) = SceneApplier.resolve(scene, from, caps)
        return SceneApplier.commands(next, caps, opts, next.separate != from.separate) to next
    }

    @Test fun nightIsACandle() {
        val (c, next) = cmds(night, solid, "1.6.1")
        assertEquals(listOf("candle=15/0/19/0"), c)
        assertEquals(LED_MODE_CANDLE, next.mode)
        assertEquals(0.15f, next.bri, 0.001f)
        // Older boards: plain candle=V.
        assertEquals(listOf("candle=15"), cmds(night, solid, "1.2.0").first)
    }

    @Test fun readIsWarmWhite() {
        val (c, next) = cmds(read, solid, "1.4.0")
        assertEquals(1, c.size)
        assertTrue(c[0], c[0].startsWith("h=") && c[0].endsWith("/80"))
        assertTrue(next.kelvinMode)
        assertEquals(4000f, next.kelvin, 0.1f)
    }

    @Test fun unsupportedModeShowsItsColour() {
        val caps = BoardCaps.of("1.1.0")
        val (next, supported) = SceneApplier.resolve(night, solid, caps)
        assertFalse(supported)
        assertEquals(LED_MODE_SOLID, next.mode)
        assertEquals(listOf("h=19/94/15"), SceneApplier.commands(next, caps, opts, false))
    }

    @Test fun separateSceneSendsItsLayoutFirst() {
        val duo = Scene(5, "Duo", LED_MODE_SOLID, hue = 0f, sat = 1f, bri = 0.5f, split = true, hue2 = 120f, sat2 = 1f)
        val (c, next) = cmds(duo, solid, "1.6.0")
        assertTrue(next.separate)
        assertEquals(listOf("split=1", "hh=0/100/50/120/100/50"), c)
        // Boards without two LEDs keep their layout and get LED1's colour.
        assertEquals(listOf("h=0/100/50"), cmds(duo, solid, "1.4.0").first)
    }

    @Test fun snapshotRoundTrip() {
        val store = SettingsStore(ApplicationProvider.getApplicationContext())
        store.saveLedState(solid.copy(mode = LED_MODE_BREATHE, separate = true))
        val before = store.ledState()
        val snap = Scene.fromJson(before.toScene(0, "Before").toJson())
        val (after, _) = SceneApplier.resolve(snap, solid.copy(mode = LED_MODE_CANDLE, bri = 0.15f), BoardCaps.of("1.6.1"))
        assertEquals(before.mode, after.mode)
        assertEquals(before.bri, after.bri, 0.001f)
        assertEquals(before.hue, after.hue, 0.5f)
        assertEquals(before.separate, after.separate)
        assertEquals(before.hue2, after.hue2, 0.5f)
    }
}

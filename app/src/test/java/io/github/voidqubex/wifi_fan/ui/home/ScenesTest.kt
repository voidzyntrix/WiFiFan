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
class ScenesTest {
    @Test fun jsonRoundTrip() {
        val list = listOf(
            Scene(7, "Movie", LED_MODE_SOLID, hue = 240f, sat = 0.8f, bri = 0.3f),
            Scene(8, "Cosy", LED_MODE_CANDLE, bri = 0.4f, candleHue = 10),
            Scene(9, "Read", LED_MODE_SOLID, kelvinMode = true, kelvin = 4000f, bri = 0.8f)
        )
        assertEquals(list, scenesFromJson(scenesToJson(list)))
    }

    @Test fun twoLedScenes() {
        val separate = Scene(
            10, "Duo", LED_MODE_SOLID, hue = 30f, sat = 1f, bri = 0.7f,
            split = true, hue2 = 200f, sat2 = 0.9f
        )
        val linked = Scene(11, "One", LED_MODE_BREATHE, hue = 120f, sat = 1f, split = false)
        assertEquals(listOf(separate, linked), scenesFromJson(scenesToJson(listOf(separate, linked))))
        // Saved by 1.11.0 (no two-LED fields): loads, and matches either layout.
        val old = scenesFromJson(
            """[{"id":3,"name":"Old","mode":0,"hue":10,"sat":1,"kelvinMode":false,"kelvin":4000,"bri":0.5}]"""
        ).single()
        assertEquals(null, old.split)
        assertTrue(old.matchesLeds(true, 0f, 0f, false, 4000f))
        assertTrue(old.matchesLeds(false, 0f, 0f, false, 4000f))
        // Two-LED scenes match their layout and LED2's colour.
        assertTrue(separate.matchesLeds(true, 201f, 0.9f, false, 4000f))
        assertFalse(separate.matchesLeds(true, 260f, 0.9f, false, 4000f))
        assertFalse(separate.matchesLeds(false, 200f, 0.9f, false, 4000f))
        assertFalse(linked.matchesLeds(true, 0f, 0f, false, 4000f))
        assertTrue(linked.matchesLeds(false, 0f, 0f, false, 4000f))
    }

    @Test fun seedsDefaultsOnce() {
        val store = SettingsStore(ApplicationProvider.getApplicationContext())
        assertEquals(listOf("Night", "Read"), store.loadScenes().map { it.name })
        store.saveScenes(emptyList())
        assertEquals(emptyList<Scene>(), store.loadScenes())
    }

    @Test fun matchesCurrentLight() {
        val read = DefaultScenes[1]
        assertTrue(read.matches(LED_MODE_SOLID, 0f, 0f, kelvinMode = true, kelvin = 4010f, bri = 0.8f))
        assertFalse(read.matches(LED_MODE_SOLID, 0f, 0f, kelvinMode = true, kelvin = 4000f, bri = 0.5f))
        assertFalse(Scene.canSave(LED_MODE_MUSIC))
        assertTrue(Scene.canSave(LED_MODE_CANDLE))
    }
}

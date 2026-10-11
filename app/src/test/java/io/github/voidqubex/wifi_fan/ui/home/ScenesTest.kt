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

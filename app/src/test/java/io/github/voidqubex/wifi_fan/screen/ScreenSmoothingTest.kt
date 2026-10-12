package io.github.voidqubex.wifi_fan.screen

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.math.abs
import kotlin.math.min

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class ScreenSmoothingTest {
    private fun hueDistance(a: Float, b: Float) = abs(a - b).let { min(it, 360f - it) }

    @Test fun theFirstColourIsShownAsItIs() {
        val first = floatArrayOf(120f, 0.8f)
        assertArrayEquals(first, ScreenSyncService.smooth(null, first), 0f)
    }

    @Test fun smallChangesAreEasedInStepByStep() {
        val next = ScreenSyncService.smooth(floatArrayOf(100f, 1f), floatArrayOf(104f, 1f))
        assertTrue("hue ${next[0]}", next[0] > 100f && next[0] < 103f)
    }

    @Test fun clearJumpsAreFollowedAtOnce() {
        // Red to green: a scene change.
        val green = ScreenSyncService.smooth(floatArrayOf(0f, 1f), floatArrayOf(120f, 1f))
        assertTrue("hue ${green[0]}", hueDistance(green[0], 120f) < 1f)
        assertEquals(1f, green[1], 0.01f)
        // A colour to white.
        val white = ScreenSyncService.smooth(floatArrayOf(200f, 0.9f), floatArrayOf(0f, 0f))
        assertEquals(0f, white[1], 0.01f)
    }

    @Test fun biggerChangesAreFollowedMore() {
        val small = ScreenSyncService.smooth(floatArrayOf(100f, 1f), floatArrayOf(110f, 1f))
        val big = ScreenSyncService.smooth(floatArrayOf(100f, 1f), floatArrayOf(140f, 1f))
        assertTrue((small[0] - 100f) / 10f < (big[0] - 100f) / 40f)
    }

    @Test fun theHueTakesTheShortWayRoundTheWheel() {
        val next = ScreenSyncService.smooth(floatArrayOf(358f, 1f), floatArrayOf(6f, 1f))
        assertTrue("hue ${next[0]}", next[0] > 0f && next[0] < 6f)
    }
}

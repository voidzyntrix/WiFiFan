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
class ScreenHalvesTest {
    @Test fun splitsRowsIntoHalves() {
        // 4 x 2 image: values are just positions.
        val px = intArrayOf(0, 1, 2, 3, 10, 11, 12, 13)
        val (left, right) = ScreenSyncService.halves(px, 4)
        assertArrayEquals(intArrayOf(0, 1, 10, 11), left)
        assertArrayEquals(intArrayOf(2, 3, 12, 13), right)
        // Odd width: the middle column goes right.
        val (l3, r3) = ScreenSyncService.halves(intArrayOf(1, 2, 3, 4, 5, 6), 3)
        assertArrayEquals(intArrayOf(1, 4), l3)
        assertArrayEquals(intArrayOf(2, 3, 5, 6), r3)
    }

    @Test fun leftRedRightBlue() {
        val w = 64
        val h = 36
        val px = IntArray(w * h) { if (it % w < w / 2) 0xFF2010 else 0x1030FF }
        val (left, right) = ScreenSyncService.halves(px, w)
        val l = ScreenSyncService.dominantColour(left)
        val r = ScreenSyncService.dominantColour(right)
        fun dist(a: Float, b: Float) = abs(a - b).let { min(it, 360f - it) }
        assertTrue("left hue ${l[0]}", dist(l[0], 4f) < 6f)
        assertTrue("right hue ${r[0]}", dist(r[0], 230f) < 6f)
        assertTrue(l[1] > 0.8f && r[1] > 0.8f)
        // The whole screen mixes the two into something else.
        val all = ScreenSyncService.dominantColour(px)
        assertEquals(left.size + right.size, px.size)
        assertTrue(all[1] < l[1])
    }
}

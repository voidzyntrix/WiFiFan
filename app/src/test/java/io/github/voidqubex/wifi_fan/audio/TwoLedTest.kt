package io.github.voidqubex.wifi_fan.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.min

class TwoLedTest {
    private fun hueDist(a: Float, b: Float): Float {
        val d = abs(a - b) % 360f
        return min(d, 360f - d)
    }

    @Test fun beatsAlternateBetweenLeds() {
        val beats = TwoLedBeats(startHue = 0f, step = 47f)
        assertEquals(0f, beats.hue1, 0.01f)
        assertEquals(47f, beats.hue2, 0.01f)
        assertEquals(0, beats.onBeat())
        assertEquals(94f, beats.hue1, 0.01f)
        assertEquals(47f, beats.hue2, 0.01f)
        assertEquals(1, beats.onBeat())
        assertEquals(141f, beats.hue2, 0.01f)
        assertEquals(0, beats.onBeat())
        assertEquals(188f, beats.hue1, 0.01f)
    }

    @Test fun bassGoesToLed1TrebleToLed2() {
        val bass = SpectrumAnalyzer.twoLedColours(floatArrayOf(1f, 0f, 0f), 77f, 99f)
        assertTrue(hueDist(bass[0][0], 0f) < 1f)        // LED1 red
        assertEquals(1f, bass[0][2], 0.01f)              // at full weight
        assertEquals(99f, bass[1][0], 0.01f)             // LED2 has nothing: keeps its hue
        assertEquals(0.3f, bass[1][2], 0.01f)            // and dims

        val treble = SpectrumAnalyzer.twoLedColours(floatArrayOf(0f, 0f, 1f), 77f, 99f)
        assertEquals(77f, treble[0][0], 0.01f)
        assertTrue(hueDist(treble[1][0], 240f) < 1f)     // LED2 blue
        assertEquals(1f, treble[1][2], 0.01f)
    }

    @Test fun midsAreShared() {
        val mid = SpectrumAnalyzer.twoLedColours(floatArrayOf(0f, 1f, 0f), 0f, 0f)
        assertTrue(hueDist(mid[0][0], 120f) < 1f)
        assertTrue(hueDist(mid[1][0], 120f) < 1f)
        assertEquals(mid[0][2], mid[1][2], 0.001f)
        // Bass plus treble: each LED takes its own end of the spectrum.
        val both = SpectrumAnalyzer.twoLedColours(floatArrayOf(1f, 0.4f, 1f), 0f, 0f)
        assertTrue(both[0][0] in 0f..60f)
        assertTrue(both[1][0] in 180f..240f)
    }
}

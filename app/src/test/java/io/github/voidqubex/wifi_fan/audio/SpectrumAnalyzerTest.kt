package io.github.voidqubex.wifi_fan.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class SpectrumAnalyzerTest {
    private fun tone(hz: Double, amplitude: Double, n: Int = 1024, rate: Int = 44_100) =
        ShortArray(n) { (sin(2 * PI * hz * it / rate) * amplitude * 32767).toInt().toShort() }

    private fun settle(a: SpectrumAnalyzer, buf: ShortArray): FloatArray {
        var out = FloatArray(3)
        repeat(8) { out = a.process(buf, buf.size) }
        return out
    }

    @Test
    fun bassToneLightsTheBassBand() {
        val b = settle(SpectrumAnalyzer(), tone(100.0, 0.5))
        assertTrue("bass ${b[0]}", b[0] > 0.8f)
        assertTrue("mids ${b[1]}", b[1] < 0.2f)
        assertTrue("treble ${b[2]}", b[2] < 0.2f)
    }

    @Test
    fun midToneLightsTheMidBand() {
        val b = settle(SpectrumAnalyzer(), tone(1000.0, 0.5))
        assertTrue(b[1] > 0.8f && b[0] < 0.2f && b[2] < 0.2f)
    }

    @Test
    fun trebleToneLightsTheTrebleBand() {
        val b = settle(SpectrumAnalyzer(), tone(5000.0, 0.5))
        assertTrue("treble ${b[2]}", b[2] > 0.8f)
        assertTrue(b[0] < 0.2f && b[1] < 0.2f)
    }

    @Test
    fun silenceStaysDark() {
        val b = settle(SpectrumAnalyzer(), ShortArray(1024))
        assertTrue(b.all { it < 0.05f })
    }

    @Test
    fun colourOrganMapsBandsToRedGreenBlue() {
        assertEquals(0f, SpectrumAnalyzer.colour(floatArrayOf(1f, 0f, 0f), 77f)[0], 1f)
        assertEquals(120f, SpectrumAnalyzer.colour(floatArrayOf(0f, 1f, 0f), 77f)[0], 1f)
        assertEquals(240f, SpectrumAnalyzer.colour(floatArrayOf(0f, 0f, 1f), 77f)[0], 1f)
        // bass and mids together land between red and green
        val yellowish = SpectrumAnalyzer.colour(floatArrayOf(1f, 1f, 0f), 77f)[0]
        assertTrue(yellowish in 50f..70f)
        // silence keeps the last hue
        assertEquals(77f, SpectrumAnalyzer.colour(floatArrayOf(0f, 0f, 0f), 77f)[0], 0.01f)
    }
}

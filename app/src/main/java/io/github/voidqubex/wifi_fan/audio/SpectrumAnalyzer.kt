package io.github.voidqubex.wifi_fan.audio

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Splits audio into bass, mids and treble for the visualizer: a Hann-windowed FFT, then the
 * level of each band relative to its own recent peak (so quiet and loud songs look alike),
 * with a quick attack and a slower release so the colours pulse instead of flicker.
 */
class SpectrumAnalyzer(private val sampleRate: Int = AudioCapture.SAMPLE_RATE, val size: Int = 1024) {
    private val re = DoubleArray(size)
    private val im = DoubleArray(size)
    private val hann = DoubleArray(size) { 0.5 - 0.5 * cos(2.0 * PI * it / (size - 1)) }
    private val cosT = DoubleArray(size / 2) { cos(2.0 * PI * it / size) }
    private val sinT = DoubleArray(size / 2) { -sin(2.0 * PI * it / size) }
    private val rev = IntArray(size).also { r ->
        val bits = Integer.numberOfTrailingZeros(size)
        for (i in 0 until size) r[i] = Integer.reverse(i) ushr (32 - bits)
    }
    private val edges = intArrayOf(bin(40.0), bin(250.0), bin(2_500.0), bin(10_000.0))
    private val peak = FloatArray(3) { FLOOR }
    private val smooth = FloatArray(3)
    private val mags = FloatArray(3)

    private fun bin(hz: Double) = (hz * size / sampleRate).roundToInt().coerceIn(1, size / 2 - 1)

    /** Smoothed (bass, mids, treble), each 0..1, for the first [size] of [n] samples in [buf]. */
    fun process(buf: ShortArray, n: Int): FloatArray {
        val count = min(n, size)
        for (i in 0 until size) {
            re[rev[i]] = if (i < count) buf[i] / 32768.0 * hann[i] else 0.0
            im[rev[i]] = 0.0
        }
        var len = 2
        while (len <= size) {
            val half = len / 2
            val step = size / len
            var i = 0
            while (i < size) {
                var k = 0
                for (j in i until i + half) {
                    val wr = cosT[k]
                    val wi = sinT[k]
                    val xr = re[j + half] * wr - im[j + half] * wi
                    val xi = re[j + half] * wi + im[j + half] * wr
                    re[j + half] = re[j] - xr
                    im[j + half] = im[j] - xi
                    re[j] += xr
                    im[j] += xi
                    k += step
                }
                i += len
            }
            len = len shl 1
        }
        val scale = 4.0 / size      // a sine of amplitude A reads about A in its bin
        for (b in 0..2) {
            val lo = edges[b]
            val hi = max(edges[b + 1], lo + 1)
            var p = 0.0
            for (k in lo until hi) p += re[k] * re[k] + im[k] * im[k]
            mags[b] = (sqrt(p / (hi - lo)) * scale).toFloat()
            peak[b] = max(max(mags[b], peak[b] * 0.996f), FLOOR)
        }
        // A band 40 dB below the loudest one is only window leakage: it stays dark instead of
        // being scaled up to full by its own (tiny) peak.
        val loudest = max(peak[0], max(peak[1], peak[2]))
        for (b in 0..2) {
            val target = (mags[b] / max(peak[b], loudest * RELATIVE_FLOOR)).coerceIn(0f, 1f).pow(1.5f)
            smooth[b] += (target - smooth[b]) * (if (target > smooth[b]) 0.7f else 0.2f)
        }
        return smooth.copyOf()
    }

    companion object {
        /** Below this a band counts as silent. */
        private const val FLOOR = 3e-4f
        /** Bands this far below the loudest band's peak (-40 dB) count as silent. */
        private const val RELATIVE_FLOOR = 0.01f

        /** Colour organ: bass is red, mids green, treble blue. */
        private val BAND_HUES = floatArrayOf(0f, 120f, 240f)

        /**
         * The colour (hue, saturation) for a (bass, mids, treble) triple: the bands pull the hue
         * towards their own colour, the strongest the most. Silence keeps [fallbackHue].
         */
        fun colour(bands: FloatArray, fallbackHue: Float): FloatArray {
            var x = 0.0
            var y = 0.0
            var sum = 0.0
            for (i in 0..2) {
                val w = (bands[i] * bands[i]).toDouble()
                val a = Math.toRadians(BAND_HUES[i].toDouble())
                x += w * cos(a)
                y += w * sin(a)
                sum += w
            }
            if (sum < 1e-4) return floatArrayOf(fallbackHue, 0.6f)
            val hue = ((Math.toDegrees(atan2(y, x)) + 360.0) % 360.0).toFloat()
            val coherence = (sqrt(x * x + y * y) / sum).toFloat()
            return floatArrayOf(hue, (0.45f + 0.55f * coherence).coerceIn(0f, 1f))
        }

        /**
         * Separate LEDs: LED1 follows the bass (with half the mids), LED2 the treble (with half
         * the mids), so LED1 swings red..yellow..green and LED2 green..cyan..blue. Each result is
         * (hue, saturation, weight); weight 0.3..1 scales that LED's brightness by how loud its
         * own bands are. Silence keeps [fallback1] / [fallback2].
         */
        fun twoLedColours(bands: FloatArray, fallback1: Float, fallback2: Float): Array<FloatArray> {
            val bass = bands[0]
            val mid = bands[1] * 0.5f
            val treble = bands[2]
            val c1 = colour(floatArrayOf(bass, mid, 0f), fallback1)
            val c2 = colour(floatArrayOf(0f, mid, treble), fallback2)
            return arrayOf(
                floatArrayOf(c1[0], c1[1], 0.3f + 0.7f * max(bass, mid).coerceIn(0f, 1f)),
                floatArrayOf(c2[0], c2[1], 0.3f + 0.7f * max(treble, mid).coerceIn(0f, 1f))
            )
        }
    }
}

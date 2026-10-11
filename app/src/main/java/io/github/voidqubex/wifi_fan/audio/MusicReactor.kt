package io.github.voidqubex.wifi_fan.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Listens to the microphone and turns loudness into a 0..1 level plus beat events.
 *
 * Every ~40 ms window: RMS and peak of the samples; an adaptive noise floor (falls fast,
 * rises slowly) and an auto-gain envelope (rises fast, decays slowly) normalise the level,
 * and a beat is an energy spike against the ~1 s moving average.
 */
class MusicReactor {
    /** Analyses one window of 16-bit samples; also used by tests. */
    class Analyzer {
        private var floor = 0f
        private var envelope = 0f
        private val history = FloatArray(HISTORY)
        private var historyCount = 0
        private var historyPos = 0
        private var sinceBeatMs = Long.MAX_VALUE / 2

        /** Returns (level 0..1, beat) for [n] samples covering [windowMs]; [sensitivity] 0..1. */
        fun process(buf: ShortArray, n: Int, windowMs: Long, sensitivity: Float): Pair<Float, Boolean> {
            if (n <= 0) return 0f to false
            var sum = 0.0
            var peak = 0
            for (i in 0 until n) {
                val s = buf[i].toInt()
                sum += (s * s).toDouble()
                peak = max(peak, abs(s))
            }
            val rms = (sqrt(sum / n) / 32768.0).toFloat()
            val pk = peak / 32768f
            // Noise floor: drop to quiet moments at once, creep up slowly.
            floor = if (rms < floor || floor == 0f) rms else floor + (rms - floor) * 0.002f
            // Auto gain: loudest recent level, decaying over a few seconds.
            envelope = max(max(rms, envelope * 0.995f), floor + 0.002f)
            val gain = 0.5f + 1.5f * sensitivity
            val norm = ((rms - floor) / (envelope - floor)).coerceIn(0f, 1f)
            // Peaks (drum hits) punch a little above the RMS level.
            val punch = ((pk - rms) / (envelope * 4f + 1e-4f)).coerceIn(0f, 0.25f)
            val level = ((norm + punch) * gain).coerceIn(0f, 1f).pow(0.8f)

            val energy = rms * rms
            val avg = if (historyCount == 0) energy else history.take(historyCount).average().toFloat()
            history[historyPos] = energy
            historyPos = (historyPos + 1) % HISTORY
            if (historyCount < HISTORY) historyCount++
            sinceBeatMs += windowMs
            val threshold = 1.25f + (1f - sensitivity) * 0.8f
            val beat = historyCount > 5 && energy > avg * threshold &&
                rms > floor * 1.8f + 0.004f && sinceBeatMs >= 180
            if (beat) sinceBeatMs = 0
            return level.coerceIn(0f, 1f) to beat
        }

        private companion object { const val HISTORY = 25 }
    }

    /**
     * Records until the calling coroutine is cancelled, calling [onFrame] (on the recording
     * thread) for every window. [sensitivity] is read each window so the slider applies live.
     * Throws [IllegalStateException] when the microphone can't be opened.
     */
    @SuppressLint("MissingPermission")   // callers check RECORD_AUDIO first
    suspend fun run(sensitivity: () -> Float, onFrame: (level: Float, beat: Boolean) -> Unit) =
        withContext(Dispatchers.IO) {
            val rate = 44_100
            val window = rate * WINDOW_MS / 1000
            val minBuf = AudioRecord.getMinBufferSize(
                rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
            )
            val rec = AudioRecord(
                MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, max(minBuf, window * 2 * 4)
            )
            check(rec.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
            val analyzer = Analyzer()
            val buf = ShortArray(window)
            try {
                rec.startRecording()
                while (coroutineContext.isActive) {
                    val n = rec.read(buf, 0, window)
                    if (n < 0) error("Microphone read failed ($n)")
                    val (level, beat) = analyzer.process(buf, n, WINDOW_MS.toLong(), sensitivity())
                    onFrame(level, beat)
                }
            } finally {
                runCatching { rec.stop() }
                rec.release()
            }
        }

    companion object { const val WINDOW_MS = 40 }
}

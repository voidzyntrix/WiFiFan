package io.github.voidqubex.wifi_fan.audio

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import kotlinx.coroutines.isActive
import kotlin.coroutines.coroutineContext
import kotlin.math.max

/** Where the audio comes from: the microphone, or what the phone's speakers play. */
object AudioCapture {
    const val SAMPLE_RATE = 44_100

    private fun minBuffer() = AudioRecord.getMinBufferSize(
        SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
    )

    /** The microphone. The caller checks RECORD_AUDIO first. */
    @SuppressLint("MissingPermission")
    fun mic(): AudioRecord {
        val window = SAMPLE_RATE * MusicReactor.WINDOW_MS / 1000
        val rec = AudioRecord(
            MediaRecorder.AudioSource.MIC, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, max(minBuffer(), window * 2 * 4)
        )
        check(rec.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
        return rec
    }

    /**
     * Whatever apps play through the speakers (Android 10+), via a screen-capture grant.
     * Apps can opt out of being captured; those just read as silence.
     */
    @SuppressLint("MissingPermission")
    fun playback(projection: MediaProjection): AudioRecord {
        val config = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val rec = AudioRecord.Builder()
            .setAudioFormat(format)
            .setAudioPlaybackCaptureConfig(config)
            .setBufferSizeInBytes(max(minBuffer(), 4096 * 4))
            .build()
        check(rec.state == AudioRecord.STATE_INITIALIZED) { "Speaker capture unavailable" }
        return rec
    }

    /**
     * Reads [windowSamples] at a time until the calling coroutine is cancelled, handing each
     * window to [onWindow] (on the reading thread), then stops and releases [rec].
     */
    suspend fun loop(rec: AudioRecord, windowSamples: Int, onWindow: (ShortArray, Int) -> Unit) {
        val buf = ShortArray(windowSamples)
        try {
            rec.startRecording()
            while (coroutineContext.isActive) {
                val n = rec.read(buf, 0, windowSamples)
                if (n < 0) error("Audio read failed ($n)")
                onWindow(buf, n)
            }
        } finally {
            runCatching { rec.stop() }
            rec.release()
        }
    }
}

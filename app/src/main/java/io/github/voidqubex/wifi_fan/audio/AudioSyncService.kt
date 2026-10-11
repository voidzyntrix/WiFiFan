package io.github.voidqubex.wifi_fan.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.IntentCompat
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.MainActivity
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.sync.LedLink
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.sync.SyncKind
import io.github.voidqubex.wifi_fan.sync.SyncParams
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Music (microphone) and Visualizer (what the speakers play) as a foreground service, so the LED
 * keeps reacting after the app is closed. It drives the board itself; the home screen only starts
 * and stops it and shows [SyncHub].
 */
class AudioSyncService : Service() {
    private var scope: CoroutineScope? = null
    private var projection: MediaProjection? = null
    private var link: LedLink? = null
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val speaker = intent?.getStringExtra(EXTRA_KIND) == KIND_SPEAKER
        val kind = if (speaker) SyncKind.VISUALIZER else SyncKind.MUSIC
        shutdown(restoreFade = false)      // already running as the other kind: start over

        val ble = (application as GlowApp).bleManager
        try {
            startForeground(
                NOTIFICATION_ID, notification(kind),
                if (speaker) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                else ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } catch (e: Exception) {
            return fail("Can't run in the background: ${e.message}")
        }

        val rec: AudioRecord = try {
            if (speaker) {
                val data = intent?.let { IntentCompat.getParcelableExtra(it, EXTRA_DATA, Intent::class.java) }
                    ?: return fail("No permission to capture the speakers")
                val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
                val mp = getSystemService(MediaProjectionManager::class.java).getMediaProjection(code, data)
                    ?: return fail("No permission to capture the speakers")
                mp.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() { main.post { stopSelf() } }
                }, main)
                projection = mp
                AudioCapture.playback(mp)
            } else {
                AudioCapture.mic()
            }
        } catch (e: Exception) {
            return fail("Can't capture audio: ${e.message}")
        }

        val l = LedLink(ble)
        link = l
        l.setFade(FADE_MS)       // short fades so the LED can follow the beat
        SyncHub.reset()
        SyncHub.active.value = kind
        val s = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        scope = s
        // Without the board there is nothing to drive.
        s.launch {
            ble.connectionState.collect {
                if (it != BluetoothProfile.STATE_CONNECTED) main.post { stopSelf() }
            }
        }
        s.launch(Dispatchers.IO) {
            try {
                if (speaker) visualize(rec, l) else listen(rec, l)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                SyncHub.error.value = "Audio sync stopped: ${e.message}"
                main.post { stopSelf() }
            }
        }
        return START_NOT_STICKY
    }

    /** Microphone: loudness is brightness, beats step the hue (or keep the picked colour). */
    private suspend fun listen(rec: AudioRecord, link: LedLink) {
        val analyzer = MusicReactor.Analyzer()
        val flash = BeatFlash()
        var beatHue = SyncParams.hue
        AudioCapture.loop(rec, AudioCapture.SAMPLE_RATE * MusicReactor.WINDOW_MS / 1000) { buf, n ->
            val (raw, beat) = analyzer.process(
                buf, n, MusicReactor.WINDOW_MS.toLong(), SyncParams.sensitivity
            )
            val level = flash.apply(raw, beat, MusicReactor.WINDOW_MS.toLong(), SyncParams.beatFlash)
            val keep = SyncParams.keepColour
            if (beat && !keep) beatHue = (beatHue + 47f) % 360f
            val h = if (keep) SyncParams.hue else beatHue
            val s = if (keep) SyncParams.sat else 1f
            SyncHub.level.value = level
            SyncHub.hue.value = h
            SyncHub.sat.value = s
            // A beat goes out at once, whatever the throttle says, so the flash is never swallowed.
            link.colour(h, s, SyncParams.bri * (0.04f + 0.96f * level), if (beat) 0L else SEND_GAP_MS)
        }
    }

    /** Speakers: bass, mids and treble mix the colour; the overall level is the brightness. */
    private suspend fun visualize(rec: AudioRecord, link: LedLink) {
        val analyzer = MusicReactor.Analyzer()
        val flash = BeatFlash()
        val spectrum = SpectrumAnalyzer()
        val windowMs = spectrum.size * 1000L / AudioCapture.SAMPLE_RATE
        var hue = SyncParams.hue
        AudioCapture.loop(rec, spectrum.size) { buf, n ->
            val (raw, beat) = analyzer.process(buf, n, windowMs, SyncParams.sensitivity)
            val level = flash.apply(raw, beat, windowMs, SyncParams.beatFlash)
            val c = SpectrumAnalyzer.colour(spectrum.process(buf, n), hue)
            hue = c[0]
            SyncHub.level.value = level
            SyncHub.hue.value = c[0]
            SyncHub.sat.value = c[1]
            link.colour(c[0], c[1], SyncParams.bri * (0.04f + 0.96f * level), if (beat) 0L else SEND_GAP_MS)
        }
    }

    private fun fail(message: String): Int {
        SyncHub.error.value = message
        stopSelf()
        return START_NOT_STICKY
    }

    private fun shutdown(restoreFade: Boolean) {
        scope?.cancel()
        scope = null
        projection?.stop()
        projection = null
        if (restoreFade) {
            val ble = (application as GlowApp).bleManager
            if (ble.connectionState.value == BluetoothProfile.STATE_CONNECTED) {
                link?.setFade(SettingsStore(this).fadeMs)
            }
        }
        link = null
    }

    override fun onDestroy() {
        shutdown(restoreFade = true)
        SyncHub.active.value = SyncKind.NONE
        SyncHub.level.value = 0f
        // Stopped with the app already closed (notification Stop): let go of the board too.
        if (!SyncHub.uiAlive) (application as GlowApp).bleManager.disconnect()
        super.onDestroy()
    }

    private fun notification(kind: SyncKind): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Music and visualizer", NotificationManager.IMPORTANCE_LOW)
        )
        val stop = PendingIntent.getService(
            this, 3, Intent(this, AudioSyncService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val open = PendingIntent.getActivity(
            this, 4, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val music = kind == SyncKind.MUSIC
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.power)
            .setContentTitle(if (music) "Glow is listening" else "Glow visualizer")
            .setContentText(
                if (music) "The LED reacts to the sound around you"
                else "The LED reacts to the audio your phone plays"
            )
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
    }

    companion object {
        private const val ACTION_STOP = "io.github.voidqubex.wifi_fan.audio.STOP"
        private const val EXTRA_KIND = "kind"
        private const val EXTRA_CODE = "code"
        private const val EXTRA_DATA = "data"
        private const val KIND_MIC = "mic"
        private const val KIND_SPEAKER = "speaker"
        private const val CHANNEL = "audio_sync"
        private const val NOTIFICATION_ID = 8
        private const val FADE_MS = 60
        private const val SEND_GAP_MS = 55L      // at most ~18 colours a second

        /** Listens to the microphone. Needs RECORD_AUDIO, and the app must be visible. */
        fun startMic(context: Context) {
            context.startForegroundService(
                Intent(context, AudioSyncService::class.java).putExtra(EXTRA_KIND, KIND_MIC)
            )
        }

        /** Captures the speakers with the result of the screen-capture consent screen. */
        fun startSpeaker(context: Context, resultCode: Int, data: Intent) {
            context.startForegroundService(
                Intent(context, AudioSyncService::class.java)
                    .putExtra(EXTRA_KIND, KIND_SPEAKER)
                    .putExtra(EXTRA_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data)
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AudioSyncService::class.java))
        }
    }
}

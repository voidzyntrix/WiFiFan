package io.github.voidqubex.wifi_fan.solar

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.MainActivity
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SecretStore
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.auto.AutoLight
import io.github.voidqubex.wifi_fan.sync.AlertCenter
import io.github.voidqubex.wifi_fan.sync.AlertKind
import io.github.voidqubex.wifi_fan.sync.LedLink
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.sync.SyncKind
import io.github.voidqubex.wifi_fan.sync.SyncParams
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.sin

/**
 * Solar: LED1 shows the grid (green exporting, amber/red importing), LED2 the home battery
 * (red empty, green full), from the FoxESS inverter. A foreground service like Screen sync, so the
 * LEDs keep following with the app closed. The inverter is asked every few minutes (its daily call
 * limit allows that); the latest colours are re-sent every 10 s so brightness changes show and a
 * rebooted board gets them back. Blink alerts go through [AlertCenter].
 */
class SolarSyncService : Service() {
    private var scope: CoroutineScope? = null
    private var link: LedLink? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (scope != null) return START_NOT_STICKY       // already running
        try {
            startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } catch (e: Exception) {
            return fail("Solar can't run in the background: ${e.message}")
        }
        val store = SettingsStore(this)
        val key = SecretStore(this).foxApiKey
        val serial = store.foxSerial
        val demo = store.solarDemo
        if (!demo && (key.isBlank() || serial.isBlank())) {
            return fail("Add your FoxESS API key and find your inverter in Settings → Solar.")
        }
        val ble = (application as GlowApp).bleManager
        if (ble.connectionState.value != BluetoothProfile.STATE_CONNECTED) {
            stopSelf()
            return START_NOT_STICKY
        }

        val l = LedLink(ble)
        link = l
        l.setFade(FADE_MS)
        SolarHub.state.value = SolarState(demo = demo)
        SyncHub.reset()
        SyncHub.active.value = SyncKind.SOLAR
        val s = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        scope = s
        val main = Handler(Looper.getMainLooper())
        // Without the board there is nothing to drive.
        s.launch {
            ble.connectionState.collect {
                if (it != BluetoothProfile.STATE_CONNECTED) main.post { stopSelf() }
            }
        }
        s.launch(Dispatchers.IO) {
            var reading: SolarReading? = null
            var lastGood = SystemClock.elapsedRealtime()
            var nextFetch = 0L
            var step = 0
            while (isActive) {
                val now = SystemClock.elapsedRealtime()
                if (now >= nextFetch) {
                    nextFetch = now + if (demo) DEMO_EVERY_MS else store.foxPollMinutes * 60_000L
                    try {
                        reading = if (demo) demoReading(step++) else FoxEssClient.reading(key, serial)
                        lastGood = now
                        SolarHub.state.value = SolarState(reading, System.currentTimeMillis(), null, demo)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        SolarHub.state.value = SolarHub.state.value.copy(error = e.message ?: "No answer from FoxESS")
                        nextFetch = now + RETRY_MS
                    }
                }
                val look = reading?.let { SolarPolicy.look(it) }
                look?.let { show(l, it) }
                AlertCenter.set("solar", SolarPolicy.alertFor(reading, now - lastGood, store.solarLowPercent))
                // Breathing needs about five updates a second; steady colours only every 10 s.
                delay(if (look != null && (look.pulse1 || look.pulse2)) PULSE_MS else RESEND_MS)
            }
        }
        return START_NOT_STICKY
    }

    /** LED1: the grid, LED2: the battery (see [SolarPolicy.look]); either may breathe. */
    private fun show(l: LedLink, look: SolarLook) {
        val bri = SyncParams.bri
        val t = SystemClock.elapsedRealtime()
        val v1 = bri * if (look.pulse1) SolarPolicy.breath(t, FAST_BREATH_MS) else 1f
        val v2 = bri * if (look.pulse2) SolarPolicy.breath(t, BREATH_MS) else 1f
        SyncHub.hue.value = look.hue1
        SyncHub.sat.value = 1f
        SyncHub.hue2.value = look.hue2
        SyncHub.sat2.value = 1f
        if (l.twoLeds) l.colours(look.hue1, 1f, v1, look.hue2, 1f, v2, 0L)
        else l.colour(look.hue1, 1f, v1, 0L)
    }

    /** Made-up readings that sweep through export, import and an emptying/filling battery. */
    private fun demoReading(step: Int): SolarReading {
        val t = step.toDouble()
        val grid = (1.8 * sin(t * 0.7)).toFloat()
        val soc = (50.0 + 50.0 * sin(t * 0.35)).toFloat()
        return SolarReading(
            gridKw = grid, socPercent = soc, pvKw = max(0f, -grid + 0.5f),
            loadKw = 0.8f, fault = false
        )
    }

    private fun fail(message: String): Int {
        SyncHub.error.value = message
        stopSelf()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope?.cancel()
        scope = null
        AlertCenter.set("solar", AlertKind.NONE)
        // Changing the mode starts the new service before this one stops: if another sync is up by
        // now, the shared state and the board's fade are theirs, not ours to reset.
        val ours = SyncHub.release(SyncKind.SOLAR)
        val ble = (application as GlowApp).bleManager
        if (ours && ble.connectionState.value == BluetoothProfile.STATE_CONNECTED) {
            link?.setFade(SettingsStore(this).fadeMs)     // back to the user's fade time
        }
        link = null
        SolarHub.state.value = SolarState()
        // Stopped with the app closed (notification Stop): let go of the board too, unless
        // another sync or Auto light still uses it.
        if (ours && !SyncHub.uiAlive && !AutoLight.running) ble.disconnect()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Solar", NotificationManager.IMPORTANCE_LOW)
        )
        val stop = PendingIntent.getService(
            this, 13, Intent(this, SolarSyncService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val open = PendingIntent.getActivity(
            this, 14, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.power)
            .setContentTitle("Glow solar")
            .setContentText("The LEDs follow your inverter: grid and battery")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
    }

    companion object {
        private const val ACTION_STOP = "io.github.voidqubex.wifi_fan.solar.STOP"
        private const val CHANNEL = "solar_sync"
        private const val NOTIFICATION_ID = 13
        /** Smooth steps between updates; short enough for the breathing's five updates a second. */
        private const val FADE_MS = 400
        private const val RESEND_MS = 10_000L
        private const val PULSE_MS = 200L
        private const val BREATH_MS = 3000L
        /** Heavy grid import pulses faster, so it reads differently from the battery's slow breath. */
        private const val FAST_BREATH_MS = 800L
        private const val RETRY_MS = 60_000L
        private const val DEMO_EVERY_MS = 10_000L

        /** Starts following the inverter. The app must be visible, and a board connected. */
        fun start(context: Context) {
            try {
                context.startForegroundService(Intent(context, SolarSyncService::class.java))
            } catch (e: Exception) {
                SyncHub.error.value = "Solar couldn't start: ${e.message}"
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SolarSyncService::class.java))
        }
    }
}

package io.github.voidqubex.wifi_fan.auto

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.MainActivity
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.sync.SyncKind
import io.github.voidqubex.wifi_fan.ui.home.LED_MODE_MUSIC
import io.github.voidqubex.wifi_fan.ui.home.LED_MODE_SCREEN
import io.github.voidqubex.wifi_fan.ui.home.LED_MODE_VISUALIZER
import io.github.voidqubex.wifi_fan.ui.home.SceneApplier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Auto light: watches the screen and lock state (nothing else) and switches between the
 * "In hand" and "Phone down & locked" scenes, also with the app closed. Decisions come from
 * [AutoLightMachine]; this service only feeds it events and applies what it decides.
 *
 * Battery: it just waits for screen on/off and unlock broadcasts, and holds a partial wake lock
 * only while counting down to Night (at most the wait time plus a minute per lock).
 */
class AutoLightService : Service(), SensorEventListener {
    private val main = Handler(Looper.getMainLooper())
    private var scope: CoroutineScope? = null
    private var started = false
    private lateinit var store: SettingsStore
    private val machine = AutoLightMachine(nightDelayMs = 2 * 60_000L)
    private var wakeLock: PowerManager.WakeLock? = null
    private var wakeForDownSince: Long? = null
    private var shownText: String? = null

    private val check = Runnable { evaluate() }

    // Room light: the light sensor decides instead of the lock and screen.
    private val room = RoomLight()
    private var roomMode = false
    private var sensorManager: SensorManager? = null
    private var listening = false
    private val roomCheck = Runnable {
        room.check(now())?.let { actRoom(it) }
        publish(now())
    }

    /**
     * Unlocked since the screen last went off. The unlock broadcast is the reliable sign: on some
     * phones the keyguard still reads as locked at that moment, which kept Night on after unlocking.
     */
    private var userPresent = false

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_USER_PRESENT -> userPresent = true
                Intent.ACTION_SCREEN_OFF -> userPresent = false
            }
            screenChanged()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val ble = (application as GlowApp).bleManager
        if (intent?.action == ACTION_STOP) {
            // Notification Stop: same as switching Auto light off in the app.
            AutoLight.setEnabled(this, false, ble)
            stopSelf()
            return START_NOT_STICKY
        }
        if (started) {
            // Started again while running: it is already in the foreground, just say so again.
            startForeground(NOTIFICATION_ID, notification(shownText ?: "Starting…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
            return START_NOT_STICKY
        }
        store = SettingsStore(this)
        try {
            startForeground(
                NOTIFICATION_ID, notification("Starting…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } catch (e: Exception) {
            SyncHub.error.value = "Auto light can't run in the background: ${e.message}"
            stopSelf()
            return START_NOT_STICKY
        }
        if (ble.connectionState.value != BluetoothProfile.STATE_CONNECTED) {
            stopSelf()
            return START_NOT_STICKY
        }
        started = true

        applySettings()
        userPresent = isScreenOn() && !getSystemService(KeyguardManager::class.java).isKeyguardLocked
        machine.start(now(), isScreenOn(), isLocked())
        machine.setPaused(SyncHub.isActive(), now())

        ContextCompat.registerReceiver(
            this, screenReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_USER_PRESENT)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        val s = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope = s
        // Without the board there is nothing to drive.
        s.launch {
            ble.connectionState.collect { if (it != BluetoothProfile.STATE_CONNECTED) stopSelf() }
        }
        AutoLight.roomLight.value = store.autoRoomLight
        s.launch { AutoLight.roomLight.collect { setRoomMode(it) } }
        // Music, Visualizer and Screen sync have the LED; Auto light waits for them.
        s.launch {
            SyncHub.active.collect {
                machine.setPaused(it != SyncKind.NONE, now())
                evaluate()
            }
        }
        evaluate()
        return START_NOT_STICKY
    }

    private fun now() = SystemClock.elapsedRealtime()

    private fun setRoomMode(on: Boolean) {
        roomMode = on
        room.reset()
        main.removeCallbacks(roomCheck)
        val sm = sensorManager ?: getSystemService(SensorManager::class.java).also { sensorManager = it }
        val light = sm?.getDefaultSensor(Sensor.TYPE_LIGHT)
        if (on && light != null && !listening) {
            listening = sm.registerListener(this, light, SensorManager.SENSOR_DELAY_NORMAL, main)
        } else if (!on && listening) {
            sm?.unregisterListener(this)
            listening = false
        }
        evaluate()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!roomMode || event.sensor.type != Sensor.TYPE_LIGHT) return
        val t = now()
        main.removeCallbacks(roomCheck)
        room.sample(event.values[0], t)?.let { actRoom(it) }
        if (room.settling) main.postDelayed(roomCheck, RoomLight.SETTLE_MS + 100)
        publish(t)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun actRoom(dark: Boolean) = applyScene(if (dark) store.autoDarkScene else store.autoBrightScene)

    private fun applySettings() {
        machine.nightDelayMs = if (store.autoNightNoWait) 0L else store.autoWaitMinutes * 60_000L
    }

    private fun isScreenOn() = getSystemService(PowerManager::class.java).isInteractive

    private fun isLocked() = !userPresent && getSystemService(KeyguardManager::class.java).isKeyguardLocked

    private fun screenChanged() {
        machine.screen(now(), isScreenOn(), isLocked())?.let { act(it) }
        evaluate()
    }

    /** Re-checks the machine (the Night countdown, a changed wait time) and refreshes everything shown. */
    private fun evaluate() {
        if (!started) return
        val t = now()
        if (roomMode) {
            // The lock and screen don't decide anything now; no Night countdown either.
            main.removeCallbacks(check)
            wakeLock?.takeIf { it.isHeld }?.release()
            publish(t)
            return
        }
        applySettings()
        machine.evaluate(t)?.let { act(it) }
        main.removeCallbacks(check)
        machine.msUntilNight(t)?.let { main.postDelayed(check, it + 500) }
        updateWakeLock(t)
        publish(t)
    }

    /** Shows the scene for a new state. */
    private fun act(state: AutoState) {
        if (roomMode) return
        val id = when (state) {
            AutoState.IN_HAND -> store.autoHandScene
            AutoState.NIGHT -> store.autoNightScene
            else -> return
        }
        applyScene(id)
    }

    /** Shows a scene, unless another sync has the LED or the board is gone. */
    private fun applyScene(id: Long) {
        val ble = (application as GlowApp).bleManager
        if (ble.connectionState.value != BluetoothProfile.STATE_CONNECTED || SyncHub.isActive()) return
        // Music, Visualizer or Screen sync was just picked in the open app and its service is still
        // starting: that choice stays.
        if (SyncHub.uiAlive && store.ledMode in SYNC_MODES) return
        val scene = AutoLight.scene(store, id) ?: return
        AutoLight.snapshotIfNeeded(store)
        val (applied, _) = SceneApplier.apply(scene, ble, store)
        AutoLight.applied.tryEmit(applied)
    }

    private fun publish(t: Long) {
        val shown = if (roomMode) {
            when (room.dark) {
                true -> AutoState.ROOM_DARK
                false -> AutoState.ROOM_BRIGHT
                null -> AutoState.WAITING
            }
        } else machine.shown(t)
        val sceneName = when (shown) {
            AutoState.IN_HAND -> AutoLight.scene(store, store.autoHandScene)?.name
            AutoState.NIGHT -> AutoLight.scene(store, store.autoNightScene)?.name
            AutoState.ROOM_DARK -> AutoLight.scene(store, store.autoDarkScene)?.name
            AutoState.ROOM_BRIGHT -> AutoLight.scene(store, store.autoBrightScene)?.name
            AutoState.WAITING -> null
        }
        val status = AutoStatus(shown, machine.paused, sceneName)
        AutoLight.status.value = status
        val text = statusText(status)
        if (text != shownText) {
            shownText = text
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text))
        }
    }

    /**
     * Keeps the CPU awake while counting down to Night, so the timer runs with the screen off.
     * Once per lock, and never longer than the wait plus a minute.
     */
    private fun updateWakeLock(t: Long) {
        val counting = machine.msUntilNight(t) != null
        val since = machine.downSinceMs
        if (counting && since != null && since != wakeForDownSince) {
            wakeForDownSince = since
            val wl = wakeLock ?: getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Glow:AutoLight")
                .also { it.setReferenceCounted(false); wakeLock = it }
            wl.acquire(machine.nightDelayMs + 60_000L)
        } else if (!counting) {
            wakeLock?.takeIf { it.isHeld }?.release()
        }
    }

    override fun onDestroy() {
        main.removeCallbacks(check)
        main.removeCallbacks(roomCheck)
        if (listening) sensorManager?.unregisterListener(this)
        listening = false
        scope?.cancel()
        scope = null
        if (started) runCatching { unregisterReceiver(screenReceiver) }
        wakeLock?.takeIf { it.isHeld }?.release()
        AutoLight.status.value = null
        super.onDestroy()
    }

    private fun notification(text: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Auto light", NotificationManager.IMPORTANCE_LOW)
        )
        val stop = PendingIntent.getService(
            this, 5, Intent(this, AutoLightService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val open = PendingIntent.getActivity(
            this, 6, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.power)
            .setContentTitle("Glow auto light")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
    }

    companion object {
        private const val ACTION_STOP = "io.github.voidqubex.wifi_fan.auto.STOP"
        private const val CHANNEL = "auto_light"
        private const val NOTIFICATION_ID = 10
        private val SYNC_MODES = listOf(LED_MODE_MUSIC, LED_MODE_VISUALIZER, LED_MODE_SCREEN)

        /** Starts watching. The app must be visible, and a board connected. */
        fun start(context: Context) {
            if (AutoLight.running) return
            try {
                context.startForegroundService(Intent(context, AutoLightService::class.java))
            } catch (e: Exception) {
                SyncHub.error.value = "Auto light couldn't start: ${e.message}"
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AutoLightService::class.java))
        }

        /** One line for the notification and the home screen. */
        fun statusText(s: AutoStatus): String = when {
            s.paused -> "Paused while another sync drives the LED"
            s.state == AutoState.IN_HAND -> "In hand" + (s.sceneName?.let { " · $it" } ?: "")
            s.state == AutoState.NIGHT -> "Night" + (s.sceneName?.let { " · $it" } ?: "")
            s.state == AutoState.ROOM_DARK -> "Dark room" + (s.sceneName?.let { " · $it" } ?: "")
            s.state == AutoState.ROOM_BRIGHT -> "Bright room" + (s.sceneName?.let { " · $it" } ?: "")
            else -> "Waiting"
        }
    }
}

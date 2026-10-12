package io.github.voidqubex.wifi_fan.motion

import android.app.KeyguardManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import io.github.voidqubex.wifi_fan.SettingsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlin.math.sqrt

/** Auto light hub: signals when to apply scenes. */
object AutoLightHub {
    val shouldApplyInHand = MutableStateFlow(false)
    val shouldApplyPhoneDown = MutableStateFlow(false)
}

class AutoLightService : Service(), SensorEventListener {
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var keyguardManager: KeyguardManager? = null
    private lateinit var settings: SettingsStore
    private val handler = Handler(Looper.getMainLooper())
    private var lastMotionTime = 0L
    private var lastLockState: Boolean? = null
    private var lastAppliedState: String? = null
    private val MOTION_THRESHOLD = 0.2f
    private val MOTION_WINDOW_MS = 2500L
    private val MOTION_HITS_NEEDED = 3
    private val MOTION_RETENTION_MS = 20_000L
    private var motionHitCount = 0
    private var motionWindowStart = 0L
    private var waitTimer: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        settings = SettingsStore(this)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }

        handler.postDelayed(::checkLockState, LOCK_CHECK_INTERVAL_MS)

        return START_NOT_STICKY
    }

    private fun checkLockState() {
        val isLocked = keyguardManager?.isKeyguardLocked ?: false
        val now = SystemClock.uptimeMillis()

        if (lastLockState == null || lastLockState != isLocked) {
            lastLockState = isLocked
            if (isLocked) {
                onPhoneLocked(now)
            } else {
                onPhoneUnlocked(now)
            }
        }

        handler.postDelayed(::checkLockState, LOCK_CHECK_INTERVAL_MS)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return
        val (x, y, z) = event.values
        val acceleration = sqrt(x * x + y * y + z * z) - 9.81f
        val jerk = kotlin.math.abs(acceleration)

        if (jerk > MOTION_THRESHOLD) {
            val now = SystemClock.uptimeMillis()
            if (now - motionWindowStart > MOTION_WINDOW_MS) {
                motionWindowStart = now
                motionHitCount = 1
            } else {
                motionHitCount++
            }

            if (motionHitCount >= MOTION_HITS_NEEDED) {
                lastMotionTime = now
                motionHitCount = 0
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun onPhoneUnlocked(now: Long) {
        lastMotionTime = now

        if (settings.inHandNoWait) {
            AutoLightHub.shouldApplyInHand.value = true
            lastAppliedState = "in_hand"
        }

        waitTimer?.let { handler.removeCallbacks(it) }
    }

    private fun onPhoneLocked(now: Long) {
        lastMotionTime = 0L
        lastAppliedState = null

        if (settings.phoneDownNoWait) {
            AutoLightHub.shouldApplyPhoneDown.value = true
            lastAppliedState = "phone_down"
        } else {
            val waitMs = settings.autoLightWaitSeconds * 1000L
            waitTimer = Runnable {
                val stillForMs = SystemClock.uptimeMillis() - lastMotionTime
                if (stillForMs >= waitMs) {
                    AutoLightHub.shouldApplyPhoneDown.value = true
                    lastAppliedState = "phone_down"
                }
            }
            handler.postDelayed(waitTimer!!, waitMs)
        }
    }

    override fun onDestroy() {
        sensorManager?.unregisterListener(this)
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val ACTION_STOP = "io.github.voidqubex.wifi_fan.motion.STOP"
        private const val LOCK_CHECK_INTERVAL_MS = 500L

        fun start(context: Context) {
            context.startService(Intent(context, AutoLightService::class.java))
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, AutoLightService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}

package io.github.voidqubex.wifi_fan.screen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import androidx.core.content.IntentCompat
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.MainActivity
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.auto.AutoLight
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.sync.LedLink
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.sync.SyncKind
import io.github.voidqubex.wifi_fan.sync.SyncParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Screen sync: mirrors the dominant colour on screen to the LED. Runs as a foreground
 * service (type mediaProjection) so it keeps going while other apps are open, and with the
 * app closed. It drives the board itself, up to twenty-five colours a second, with a short fade
 * and the fastest Bluetooth link so the LED keeps up with the screen.
 */
class ScreenSyncService : Service() {
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var smoothed: FloatArray? = null
    private var smoothed2: FloatArray? = null
    private var link: LedLink? = null
    private var scope: CoroutineScope? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val data = intent?.let { IntentCompat.getParcelableExtra(it, EXTRA_DATA, Intent::class.java) }
        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        if (data == null || projection != null) {
            if (projection == null) stopSelf()
            return START_NOT_STICKY
        }
        // The service must be in the foreground (type mediaProjection) before getMediaProjection.
        startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val mp = runCatching { mpm.getMediaProjection(code, data) }.getOrNull()
        if (mp == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        projection = mp
        val t = HandlerThread("screen-sync").also { it.start() }
        thread = t
        val h = Handler(t.looper)
        handler = h
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { stopSelf() }
        }, h)
        val metrics = resources.displayMetrics
        val w = WIDTH
        val hgt = max(1, WIDTH * metrics.heightPixels / max(1, metrics.widthPixels))
        val r = ImageReader.newInstance(w, hgt, PixelFormat.RGBA_8888, 2)
        reader = r
        display = mp.createVirtualDisplay(
            "glow-screen-sync", w, hgt, max(1, metrics.densityDpi / 8),
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, h
        )
        val ble = (application as GlowApp).bleManager
        val l = LedLink(ble)
        link = l
        l.setFade(FADE_MS)
        ble.setLowLatency(true)
        SyncHub.reset()
        SyncHub.active.value = SyncKind.SCREEN
        val s = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        scope = s
        // Without the board there is nothing to drive.
        s.launch {
            ble.connectionState.collect {
                if (it != BluetoothProfile.STATE_CONNECTED) h.post { stopSelf() }
            }
        }
        h.post(object : Runnable {
            override fun run() {
                sample()
                handler?.postDelayed(this, PERIOD_MS)
            }
        })
        return START_NOT_STICKY
    }

    private fun sample() {
        val image = runCatching { reader?.acquireLatestImage() }.getOrNull() ?: return
        try {
            val plane = image.planes[0]
            val buf = plane.buffer
            val px = IntArray(image.width * image.height)
            var k = 0
            for (y in 0 until image.height) {
                val row = y * plane.rowStride
                for (x in 0 until image.width) {
                    val o = row + x * plane.pixelStride
                    val r = buf.get(o).toInt() and 0xFF
                    val g = buf.get(o + 1).toInt() and 0xFF
                    val b = buf.get(o + 2).toInt() and 0xFF
                    px[k++] = (r shl 16) or (g shl 8) or b
                }
            }
            val l = link ?: return
            if (l.twoLeds) {
                // Separate LEDs: the left half of the screen goes to LED1, the right half to LED2.
                val (left, right) = halves(px, image.width)
                val next = smooth(smoothed, dominantColour(left))
                val next2 = smooth(smoothed2, dominantColour(right))
                smoothed = next
                smoothed2 = next2
                SyncHub.hue.value = next[0]
                SyncHub.sat.value = next[1]
                SyncHub.hue2.value = next2[0]
                SyncHub.sat2.value = next2[1]
                val bri = SyncParams.bri
                l.colours(next[0], next[1], bri, next2[0], next2[1], bri, SEND_GAP_MS, skipIfBacklogged = true)
                return
            }
            val next = smooth(smoothed, dominantColour(px))
            smoothed = next
            SyncHub.hue.value = next[0]
            SyncHub.sat.value = next[1]
            l.colour(next[0], next[1], SyncParams.bri, SEND_GAP_MS, skipIfBacklogged = true)
        } finally {
            image.close()
        }
    }

    override fun onDestroy() {
        scope?.cancel()
        scope = null
        handler?.removeCallbacksAndMessages(null)
        display?.release()
        reader?.close()
        projection?.stop()
        thread?.quitSafely()
        projection = null
        // Changing the mode starts the new service before this one stops: if Music or Visualizer
        // is up by now, the shared state and the board's fade are theirs, not ours to reset.
        val ours = SyncHub.release(SyncKind.SCREEN)
        val ble = (application as GlowApp).bleManager
        if (ble.connectionState.value == BluetoothProfile.STATE_CONNECTED) {
            ble.setLowLatency(false)
            if (ours) link?.setFade(SettingsStore(this).fadeMs)     // back to the user's fade time
        }
        link = null
        // Stopped with the app closed (notification Stop): let go of the board too, unless
        // another sync or Auto light still uses it.
        if (ours && !SyncHub.uiAlive && !AutoLight.running) ble.disconnect()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Screen sync", NotificationManager.IMPORTANCE_LOW)
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, ScreenSyncService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val open = PendingIntent.getActivity(
            this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.power)
            .setContentTitle("Glow screen sync")
            .setContentText("The LED follows the colours on your screen")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
    }

    companion object {
        private const val ACTION_STOP = "io.github.voidqubex.wifi_fan.screen.STOP"
        private const val EXTRA_CODE = "code"
        private const val EXTRA_DATA = "data"
        private const val CHANNEL = "screen_sync"
        private const val NOTIFICATION_ID = 7
        private const val WIDTH = 64
        /** How often the screen is looked at (about 25 times a second). */
        private const val PERIOD_MS = 40L
        /** Least time between two colours sent to the board. */
        private const val SEND_GAP_MS = 25L
        /** Share of a small colour change shown per look; bigger changes follow faster (see [smooth]). */
        private const val SMOOTHING = 0.4f
        /** A colour change this big (distance on the hue/saturation disc, 0..2) is followed at once. */
        private const val JUMP = 0.45f
        /** Short, so the LED follows the screen instead of lagging behind it. */
        private const val FADE_MS = 80

        /** Starts capturing with the result of the screen-capture consent screen. */
        fun start(context: Context, resultCode: Int, data: Intent) {
            context.startForegroundService(
                Intent(context, ScreenSyncService::class.java)
                    .putExtra(EXTRA_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data)
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenSyncService::class.java))
        }

        /**
         * The colour to show after a look: [target] eased in from [prev] (hue, saturation). Small
         * changes are eased so the LED doesn't flicker with the picture; the bigger the change the
         * more of it is taken, and a clear jump (a scene cut, a new colour filling the screen) is
         * followed at once instead of lagging for several looks.
         */
        fun smooth(prev: FloatArray?, target: FloatArray): FloatArray {
            if (prev == null) return target
            val a = Math.toRadians(prev[0].toDouble())
            val b = Math.toRadians(target[0].toDouble())
            val dx = target[1] * cos(b) - prev[1] * cos(a)
            val dy = target[1] * sin(b) - prev[1] * sin(a)
            val distance = sqrt(dx * dx + dy * dy).toFloat()
            val follow = (SMOOTHING + (1f - SMOOTHING) * distance / JUMP).coerceAtMost(1f)
            return floatArrayOf(
                lerpHue(prev[0], target[0], follow),
                prev[1] + (target[1] - prev[1]) * follow
            )
        }

        /**
         * Vibrant dominant colour of RGB pixels as (hue, saturation): near-black and
         * near-white pixels are ignored, saturated ones weigh more. Grey screens give
         * saturation ~0 (white light).
         */
        fun dominantColour(pixels: IntArray): FloatArray {
            var cx = 0.0
            var cy = 0.0
            var wSum = 0.0
            var sSum = 0.0
            val hsv = FloatArray(3)
            for (p in pixels) {
                rgbToHsv((p shr 16) and 0xFF, (p shr 8) and 0xFF, p and 0xFF, hsv)
                val s = hsv[1]
                val v = hsv[2]
                if (v < 0.12f || (s < 0.1f && v > 0.9f)) continue
                val w = (s * s * v).toDouble() + 1e-4
                val a = Math.toRadians(hsv[0].toDouble())
                cx += cos(a) * w
                cy += sin(a) * w
                wSum += w
                sSum += s * w
            }
            if (wSum <= pixels.size * 2e-4) return floatArrayOf(0f, 0f)
            val hue = ((Math.toDegrees(atan2(cy, cx)) + 360.0) % 360.0).toFloat()
            // Hues that disagree (the vectors cancel out) mean a less saturated mix.
            val coherence = (sqrt(cx * cx + cy * cy) / wSum).toFloat()
            val sat = ((sSum / wSum).toFloat() * coherence * 1.15f).coerceIn(0f, 1f)
            return floatArrayOf(hue, sat)
        }

        /**
         * Splits a row-major image [width] pixels wide into its left and right halves (an odd
         * middle column goes to the right).
         */
        fun halves(pixels: IntArray, width: Int): Pair<IntArray, IntArray> {
            if (width <= 1) return pixels to pixels
            val rows = pixels.size / width
            val half = width / 2
            val left = IntArray(rows * half)
            val right = IntArray(rows * (width - half))
            for (y in 0 until rows) {
                System.arraycopy(pixels, y * width, left, y * half, half)
                System.arraycopy(pixels, y * width + half, right, y * (width - half), width - half)
            }
            return left to right
        }

        private fun rgbToHsv(r: Int, g: Int, b: Int, out: FloatArray) {
            val mx = max(r, max(g, b))
            val mn = min(r, min(g, b))
            val d = (mx - mn).toFloat()
            out[2] = mx / 255f
            out[1] = if (mx == 0) 0f else d / mx
            out[0] = when {
                d == 0f -> 0f
                mx == r -> 60f * (((g - b) / d + 6f) % 6f)
                mx == g -> 60f * ((b - r) / d + 2f)
                else -> 60f * ((r - g) / d + 4f)
            }
        }

        private fun lerpHue(a: Float, b: Float, t: Float): Float {
            var d = (b - a) % 360f
            if (d > 180f) d -= 360f
            if (d < -180f) d += 360f
            return ((a + d * t) % 360f + 360f) % 360f
        }
    }
}

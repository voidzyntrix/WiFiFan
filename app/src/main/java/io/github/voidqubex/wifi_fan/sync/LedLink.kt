package io.github.voidqubex.wifi_fan.sync

import android.graphics.Color
import android.os.SystemClock
import io.github.voidqubex.wifi_fan.Commands
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.ui.home.MIN_VISIBLE_BRIGHTNESS
import kotlin.math.roundToInt

/** How the sync services talk to the board, with no UI involved. */
class LedLink(private val ble: BleManager) {
    @Volatile private var last = 0L

    private fun fwAtLeast(v: String) =
        ble.firmwareVersion.value?.let { GitHubReleases.compareVersions(it, v) >= 0 } ?: false

    /**
     * Shows a colour: HSV on firmware 1.1.0+, RGB on older. Skipped when the LED is off or when
     * the last colour went out less than [minGapMs] ago, so the link isn't flooded.
     */
    fun colour(h: Float, s: Float, v: Float, minGapMs: Long): Boolean {
        if (v < MIN_VISIBLE_BRIGHTNESS) return false
        val now = SystemClock.uptimeMillis()
        if (now - last < minGapMs) return false
        last = now
        val sat = s.coerceIn(0f, 1f)
        val value = v.coerceIn(0f, 1f)
        ble.sendData(
            if (fwAtLeast("1.1.0")) {
                val hue = ((h.roundToInt() % 360) + 360) % 360
                "${Commands.LED_HSV}$hue/${(sat * 100).roundToInt()}/${(value * 100).roundToInt()}"
            } else {
                val c = Color.HSVToColor(floatArrayOf(h, sat, value))
                "${Commands.LED}${Color.red(c)}/${Color.green(c)}/${Color.blue(c)}"
            }
        )
        return true
    }

    /** The time the board takes to reach a new colour (firmware 1.3.0+). */
    fun setFade(ms: Int) {
        if (fwAtLeast("1.3.0")) ble.sendData("fade=$ms")
    }
}

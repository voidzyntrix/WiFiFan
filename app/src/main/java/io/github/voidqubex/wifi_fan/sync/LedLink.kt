package io.github.voidqubex.wifi_fan.sync

import android.graphics.Color
import android.os.SystemClock
import io.github.voidqubex.wifi_fan.Commands
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.ui.home.MIN_VISIBLE_BRIGHTNESS
import kotlin.math.max
import kotlin.math.roundToInt

/** Text commands for the board's colours. */
object LedCommands {
    /** `H/S/V`: hue 0-359 degrees, saturation and brightness 0-100 %. */
    fun hsv(h: Float, s: Float, v: Float): String {
        val hue = ((h.roundToInt() % 360) + 360) % 360
        return "$hue/${(s.coerceIn(0f, 1f) * 100).roundToInt()}/${(v.coerceIn(0f, 1f) * 100).roundToInt()}"
    }

    /** Both LEDs in one go, each with its own colour (firmware 1.6.0+): `hh=H1/S1/V1/H2/S2/V2`. */
    fun pair(h1: Float, s1: Float, v1: Float, h2: Float, s2: Float, v2: Float) =
        "hh=${hsv(h1, s1, v1)}/${hsv(h2, s2, v2)}"

    /** Linked (0) or Separate (1) LEDs (firmware 1.6.0+; the board boots Linked). */
    fun split(separate: Boolean) = "split=${if (separate) 1 else 0}"
}

/** How the sync services talk to the board, with no UI involved. */
class LedLink(private val ble: BleManager) {
    @Volatile private var last = 0L

    private fun fwAtLeast(v: String) =
        ble.firmwareVersion.value?.let { GitHubReleases.compareVersions(it, v) >= 0 } ?: false

    /** Separate LEDs are wanted and the board can do them: drive each LED on its own with [colours]. */
    val twoLeds: Boolean get() = SyncParams.split && fwAtLeast("1.6.0")

    private fun due(minGapMs: Long): Boolean {
        val now = SystemClock.uptimeMillis()
        if (now - last < minGapMs) return false
        last = now
        return true
    }

    /**
     * Shows a colour: HSV on firmware 1.1.0+, RGB on older. Skipped when the LED is off or when
     * the last colour went out less than [minGapMs] ago, so the link isn't flooded.
     */
    fun colour(h: Float, s: Float, v: Float, minGapMs: Long): Boolean {
        if (v < MIN_VISIBLE_BRIGHTNESS) return false
        if (!due(minGapMs)) return false
        val sat = s.coerceIn(0f, 1f)
        val value = v.coerceIn(0f, 1f)
        ble.sendData(
            if (fwAtLeast("1.1.0")) {
                Commands.LED_HSV + LedCommands.hsv(h, sat, value)
            } else {
                val c = Color.HSVToColor(floatArrayOf(h, sat, value))
                "${Commands.LED}${Color.red(c)}/${Color.green(c)}/${Color.blue(c)}"
            }
        )
        return true
    }

    /**
     * Two colours, one per LED, as a single `hh=` command (one throttled send, like [colour]).
     * Boards before 1.6.0 only get LED1's colour.
     */
    fun colours(h1: Float, s1: Float, v1: Float, h2: Float, s2: Float, v2: Float, minGapMs: Long): Boolean {
        if (!fwAtLeast("1.6.0")) return colour(h1, s1, v1, minGapMs)
        if (max(v1, v2) < MIN_VISIBLE_BRIGHTNESS) return false
        if (!due(minGapMs)) return false
        ble.sendData(LedCommands.pair(h1, s1, v1, h2, s2, v2))
        return true
    }

    /** The time the board takes to reach a new colour (firmware 1.3.0+). */
    fun setFade(ms: Int) {
        if (fwAtLeast("1.3.0")) ble.sendData("fade=$ms")
    }
}

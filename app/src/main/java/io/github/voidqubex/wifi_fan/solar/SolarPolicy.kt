package io.github.voidqubex.wifi_fan.solar

import io.github.voidqubex.wifi_fan.sync.AlertKind
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos

/** What the two LEDs show for a reading: a hue each, and whether it breathes instead of staying solid. */
data class SolarLook(
    val hue1: Float, val pulse1: Boolean, val level1: Float = 1f,
    val hue2: Float, val pulse2: Boolean, val fastPulse2: Boolean
)

/** How a [SolarReading] becomes LED colours and blink alerts, as plain Kotlin so it can be tested. */
object SolarPolicy {
    /** No good reading for this long counts as "offline". */
    const val STALE_MS = 6 * 60_000L

    /** Hue of the grid LED when import and export balance out (a lime green). */
    private const val BALANCED_HUE = 105f

    /** From this much import (kW) on the grid LED is fully red. */
    private const val RED_AT_KW = 1.5f

    /** Any import from this much (kW) on is clearly yellow, not yellow-green. */
    private const val YELLOW_KW = 0.1f
    private const val YELLOW_HUE = 60f

    /** Exporting more than this (kW) shows pure green. */
    private const val EXPORT_KW = 0.05f

    /**
     * LED1, the grid: green while exporting, lime when balanced, yellow from 0.1 kW of import,
     * red from 1.5 kW. Degrees of hue.
     */
    fun gridHue(gridKw: Float): Float = when {
        gridKw <= -EXPORT_KW -> 120f
        gridKw < YELLOW_KW -> BALANCED_HUE - (BALANCED_HUE - YELLOW_HUE) * (gridKw.coerceAtLeast(0f) / YELLOW_KW)
        else -> (YELLOW_HUE * (1f - (gridKw - YELLOW_KW) / (RED_AT_KW - YELLOW_KW))).coerceIn(0f, YELLOW_HUE)
    }

    /** Hue of LED1 while the grid is down: blue, which nothing else uses. */
    const val OFF_GRID_HUE = 220f

    /** House load (kW) at which LED1 is at its dimmest while the grid is down. */
    const val GRID_DOWN_LOAD_LOW_KW = 0.2f

    /** House load (kW) at which LED1 is at full brightness while the grid is down. */
    const val GRID_DOWN_LOAD_FULL_KW = 2.0f

    /** Dimmest LED1 while the grid is down, so it stays visible at the low end. */
    const val GRID_DOWN_DIM = 0.2f

    /** Importing more than this (kW) makes LED1 pulse. */
    const val HEAVY_IMPORT_KW = 1.0f

    /** Exporting more than this (kW) turns LED1 cyan. */
    const val HEAVY_EXPORT_KW = 4.0f
    const val HEAVY_EXPORT_HUE = 165f

    /** With no sun below this (kW) the battery alone carries the house when the grid is down. */
    private const val NO_SUN_KW = 0.1f

    /** LED1 for a reading: blue when the grid is down, cyan for a big export, else [gridHue]. */
    fun led1Hue(r: SolarReading): Float = when {
        r.offGrid -> OFF_GRID_HUE
        r.gridKw <= -HEAVY_EXPORT_KW -> HEAVY_EXPORT_HUE
        else -> gridHue(r.gridKw)
    }

    /**
     * Both LEDs. LED1 (grid) pulses while importing more than [HEAVY_IMPORT_KW]. LED2 (battery) keeps
     * the battery colour and breathes only while the grid is down and there is no sun, i.e. the
     * battery alone carries the house; below [BATTERY_FAST_BELOW] that breath is fast. With grid or
     * sun available it stays solid.
     */
    fun look(r: SolarReading): SolarLook {
        val h1 = led1Hue(r)
        val soc = r.socPercent
        return SolarLook(
            hue1 = h1,
            pulse1 = !r.offGrid && r.gridKw > HEAVY_IMPORT_KW,
            level1 = if (r.offGrid) gridDownLevel(r.loadKw) else 1f,
            hue2 = if (soc != null) batteryHue(soc) else h1,
            pulse2 = soc != null && r.offGrid && r.pvKw < NO_SUN_KW,
            fastPulse2 = soc != null && soc < BATTERY_FAST_BELOW
        )
    }

    /**
     * While the grid is down, LED1's brightness follows the house load: [GRID_DOWN_DIM] at
     * [GRID_DOWN_LOAD_LOW_KW] or less, full at [GRID_DOWN_LOAD_FULL_KW] or more, linear in between.
     */
    fun gridDownLevel(loadKw: Float): Float {
        val t = ((loadKw - GRID_DOWN_LOAD_LOW_KW) / (GRID_DOWN_LOAD_FULL_KW - GRID_DOWN_LOAD_LOW_KW)).coerceIn(0f, 1f)
        return GRID_DOWN_DIM + (1f - GRID_DOWN_DIM) * t
    }

    /** Brightness factor from [low] to 1 over a breath [periodMs] long at [timeMs] (smooth, starts dim). */
    fun breath(timeMs: Long, periodMs: Long, low: Float): Float {
        val phase = (timeMs % periodMs).toFloat() / periodMs
        return low + (1f - low) * (0.5f - 0.5f * cos(2.0 * PI * phase)).toFloat()
    }

    /** Battery below this (%) is red. */
    const val BATTERY_RED_BELOW = 30f

    /** Battery above this (%) is green; between the two it is yellow. */
    const val BATTERY_GREEN_ABOVE = 75f

    /** Battery below this (%) breathes fast, to show it is nearly empty. */
    const val BATTERY_FAST_BELOW = 20f

    /** LED2, the home battery: green above 75 %, yellow from 30 % to 75 %, red below 30 %. Degrees of hue. */
    fun batteryHue(socPercent: Float): Float = when {
        socPercent > BATTERY_GREEN_ABOVE -> 120f
        socPercent >= BATTERY_RED_BELOW -> 60f
        else -> 0f
    }

    /**
     * What the board should blink: red for an inverter fault, a power cut (grid down), no reading
     * for [STALE_MS] (offline) or a battery below [lowPercent]; green when the battery is full and the sun still pushes extra
     * power to the grid. [ageMs] is the time since the last good reading.
     */
    fun alertFor(reading: SolarReading?, ageMs: Long, lowPercent: Int): AlertKind {
        if (ageMs > STALE_MS) return AlertKind.RED
        if (reading == null) return AlertKind.NONE
        if (reading.fault || reading.offGrid) return AlertKind.RED
        val soc = reading.socPercent
        return when {
            soc != null && soc < lowPercent -> AlertKind.RED
            soc != null && soc >= 99f && reading.gridKw < -0.2f && reading.pvKw > 0.3f -> AlertKind.GREEN
            else -> AlertKind.NONE
        }
    }

    /** One line for the Solar panel. */
    fun describe(r: SolarReading): String {
        val grid = when {
            r.offGrid -> "is down"
            r.gridKw <= -EXPORT_KW -> "exporting %.1f kW".format(abs(r.gridKw))
            r.gridKw >= EXPORT_KW -> "importing %.1f kW".format(r.gridKw)
            else -> "balanced"
        }
        val parts = mutableListOf("Grid $grid")
        r.socPercent?.let { parts += "battery ${it.toInt()} %" }
        parts += "solar %.1f kW".format(r.pvKw)
        parts += "house %.1f kW".format(r.loadKw)
        if (r.fault) parts += "inverter fault"
        return parts.joinToString(" · ")
    }
}

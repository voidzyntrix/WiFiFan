package io.github.voidqubex.wifi_fan.solar

import io.github.voidqubex.wifi_fan.sync.AlertKind
import kotlin.math.abs

/** How a [SolarReading] becomes LED colours and blink alerts, as plain Kotlin so it can be tested. */
object SolarPolicy {
    /** No good reading for this long counts as "offline". */
    const val STALE_MS = 6 * 60_000L

    /** Hue of the grid LED when import and export balance out (a lime green). */
    private const val BALANCED_HUE = 105f

    /** From this much import (kW) on the grid LED is fully red. */
    private const val RED_AT_KW = 1.5f

    /** Exporting more than this (kW) shows pure green. */
    private const val EXPORT_KW = 0.05f

    /**
     * LED1, the grid: green while exporting, lime when balanced, amber around 0.9 kW of import,
     * red from 1.5 kW. Degrees of hue.
     */
    fun gridHue(gridKw: Float): Float = when {
        gridKw <= -EXPORT_KW -> 120f
        else -> (BALANCED_HUE * (1f - gridKw.coerceAtLeast(0f) / RED_AT_KW)).coerceIn(0f, BALANCED_HUE)
    }

    /** LED2, the home battery: red when empty to green when full. Degrees of hue. */
    fun batteryHue(socPercent: Float): Float = socPercent.coerceIn(0f, 100f) * 1.2f

    /**
     * What the board should blink: red for an inverter fault, no reading for [STALE_MS] (offline) or
     * a battery below [lowPercent]; green when the battery is full and the sun still pushes extra
     * power to the grid. [ageMs] is the time since the last good reading.
     */
    fun alertFor(reading: SolarReading?, ageMs: Long, lowPercent: Int): AlertKind {
        if (ageMs > STALE_MS) return AlertKind.RED
        if (reading == null) return AlertKind.NONE
        if (reading.fault) return AlertKind.RED
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

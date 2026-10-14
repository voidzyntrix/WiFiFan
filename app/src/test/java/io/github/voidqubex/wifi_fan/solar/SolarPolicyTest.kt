package io.github.voidqubex.wifi_fan.solar

import io.github.voidqubex.wifi_fan.sync.AlertKind
import org.junit.Assert.assertEquals
import org.junit.Test

class SolarPolicyTest {
    private fun reading(
        grid: Float = 0f, soc: Float? = 60f, pv: Float = 1f, fault: Boolean = false
    ) = SolarReading(gridKw = grid, socPercent = soc, pvKw = pv, loadKw = 1f, fault = fault)

    @Test fun gridLedIsGreenWhileExporting() {
        assertEquals(120f, SolarPolicy.gridHue(-0.05f), 0.01f)
        assertEquals(120f, SolarPolicy.gridHue(-3f), 0.01f)
    }

    @Test fun gridLedGoesFromLimeThroughAmberToRed() {
        assertEquals(105f, SolarPolicy.gridHue(0f), 0.01f)
        assertEquals(52.5f, SolarPolicy.gridHue(0.75f), 0.01f)
        assertEquals(0f, SolarPolicy.gridHue(1.5f), 0.01f)
        assertEquals(0f, SolarPolicy.gridHue(6f), 0.01f)
    }

    @Test fun batteryLedGoesFromRedToGreen() {
        assertEquals(0f, SolarPolicy.batteryHue(0f), 0.01f)
        assertEquals(60f, SolarPolicy.batteryHue(50f), 0.01f)
        assertEquals(120f, SolarPolicy.batteryHue(100f), 0.01f)
        assertEquals(120f, SolarPolicy.batteryHue(140f), 0.01f)
    }

    @Test fun lowBatteryAndFaultsBlinkRed() {
        assertEquals(AlertKind.RED, SolarPolicy.alertFor(reading(soc = 12f), 0, 20))
        assertEquals(AlertKind.RED, SolarPolicy.alertFor(reading(fault = true), 0, 20))
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(reading(soc = 45f), 0, 20))
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(reading(soc = 20f), 0, 20))
    }

    @Test fun noBatteryMeansNoBatteryAlert() {
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(reading(soc = null), 0, 20))
    }

    @Test fun silenceCountsAsOffline() {
        assertEquals(AlertKind.RED, SolarPolicy.alertFor(reading(), SolarPolicy.STALE_MS + 1, 20))
        assertEquals(AlertKind.RED, SolarPolicy.alertFor(null, SolarPolicy.STALE_MS + 1, 20))
        // The first reading may take a while: no reading yet is not an alert on its own.
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(null, 30_000, 20))
    }

    @Test fun fullBatteryWithSurplusBlinksGreen() {
        assertEquals(AlertKind.GREEN, SolarPolicy.alertFor(reading(grid = -1.2f, soc = 100f, pv = 3f), 0, 20))
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(reading(grid = 0.4f, soc = 100f, pv = 3f), 0, 20))
        assertEquals(AlertKind.NONE, SolarPolicy.alertFor(reading(grid = -1.2f, soc = 80f, pv = 3f), 0, 20))
    }
}

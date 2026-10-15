package io.github.voidqubex.wifi_fan.solar

import io.github.voidqubex.wifi_fan.sync.AlertKind
import org.junit.Assert.assertEquals
import org.junit.Test

class SolarPolicyTest {
    private fun reading(
        grid: Float = 0f, soc: Float? = 60f, pv: Float = 1f, fault: Boolean = false, offGrid: Boolean = false
    ) = SolarReading(gridKw = grid, socPercent = soc, pvKw = pv, loadKw = 1f, fault = fault, offGrid = offGrid)

    @Test fun gridLedIsGreenWhileExporting() {
        assertEquals(120f, SolarPolicy.gridHue(-0.05f), 0.01f)
        assertEquals(120f, SolarPolicy.gridHue(-3f), 0.01f)
    }

    @Test fun gridLedGoesFromLimeThroughAmberToRed() {
        assertEquals(105f, SolarPolicy.gridHue(0f), 0.01f)
        assertEquals(60f, SolarPolicy.gridHue(0.1f), 0.01f)
        assertEquals(55.7f, SolarPolicy.gridHue(0.2f), 0.1f)
        assertEquals(32.1f, SolarPolicy.gridHue(0.75f), 0.1f)
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

    @Test fun aPowerCutIsBlueAndBlinksRed() {
        val cut = reading(offGrid = true)
        assertEquals(SolarPolicy.OFF_GRID_HUE, SolarPolicy.led1Hue(cut), 0.01f)
        assertEquals(AlertKind.RED, SolarPolicy.alertFor(cut, 0, 20))
        assertEquals(SolarPolicy.gridHue(0f), SolarPolicy.led1Hue(reading()), 0.01f)
        assertEquals(true, SolarPolicy.describe(cut).startsWith("Grid is down"))
    }

    @Test fun aBigExportTurnsLed1Cyan() {
        assertEquals(SolarPolicy.HEAVY_EXPORT_HUE, SolarPolicy.led1Hue(reading(grid = -4.5f)), 0.01f)
        assertEquals(120f, SolarPolicy.led1Hue(reading(grid = -3.9f)), 0.01f)
    }

    @Test fun heavyImportMakesLed1Pulse() {
        assertEquals(true, SolarPolicy.look(reading(grid = 1.4f)).pulse1)
        assertEquals(false, SolarPolicy.look(reading(grid = 0.9f)).pulse1)
        assertEquals(false, SolarPolicy.look(reading(grid = -2f)).pulse1)
    }

    @Test fun batteryLedBreathesOnlyWhenTheBatteryAloneCarriesTheHouse() {
        val night = SolarPolicy.look(reading(soc = 50f, pv = 0f, offGrid = true))
        assertEquals(true, night.pulse2)
        assertEquals(60f, night.hue2, 0.01f)
        assertEquals(false, SolarPolicy.look(reading(soc = 50f, pv = 1.2f, offGrid = true)).pulse2)
        assertEquals(false, SolarPolicy.look(reading(soc = 50f, pv = 0f, offGrid = false)).pulse2)
        assertEquals(false, SolarPolicy.look(reading(soc = null, pv = 0f, offGrid = true)).pulse2)
    }

    @Test fun theBreathIsSmoothAndStartsDim() {
        assertEquals(0.05f, SolarPolicy.breath(0, 3000, 0.05f), 0.001f)
        assertEquals(1f, SolarPolicy.breath(1500, 3000, 0.05f), 0.001f)
        assertEquals(0.05f, SolarPolicy.breath(3000, 3000, 0.05f), 0.001f)

    @Test fun gridDownBlueFollowsTheHouseLoad() {
        assertEquals(0.2f, SolarPolicy.gridDownLevel(0f), 0.001f)
        assertEquals(0.2f, SolarPolicy.gridDownLevel(0.2f), 0.001f)
        assertEquals(0.6f, SolarPolicy.gridDownLevel(1.1f), 0.001f)
        assertEquals(1f, SolarPolicy.gridDownLevel(2f), 0.001f)
        assertEquals(1f, SolarPolicy.gridDownLevel(5f), 0.001f)
    }

    @Test fun onlyTheGridDownBlueDependsOnTheLoad() {
        val cutAt1kw = SolarReading(gridKw = 0f, socPercent = 60f, pvKw = 0f, loadKw = 1.1f, fault = false, offGrid = true)
        assertEquals(0.6f, SolarPolicy.look(cutAt1kw).level1, 0.001f)
        val gridUp = SolarReading(gridKw = 0f, socPercent = 60f, pvKw = 0f, loadKw = 1.1f, fault = false)
        assertEquals(1f, SolarPolicy.look(gridUp).level1, 0.001f)
    }

    @Test fun batteryColourBands() {
        assertEquals(120f, SolarPolicy.batteryHue(80f), 0.01f)
        assertEquals(60f, SolarPolicy.batteryHue(75f), 0.01f)
        assertEquals(60f, SolarPolicy.batteryHue(30f), 0.01f)
        assertEquals(0f, SolarPolicy.batteryHue(29f), 0.01f)
    }

    @Test fun lowBatteryOnBatteryBreathesFast() {
        assertEquals(true, SolarPolicy.look(reading(soc = 15f, pv = 0f, offGrid = true)).fastPulse2)
        assertEquals(false, SolarPolicy.look(reading(soc = 50f, pv = 0f, offGrid = true)).fastPulse2)
    }
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

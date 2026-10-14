package io.github.voidqubex.wifi_fan.battery

import org.junit.Assert.assertEquals
import org.junit.Test

class BatteryAlertPolicyTest {
    private fun state(percent: Int, plugged: Boolean = false, full: Boolean = false, low: Boolean = true, fullOn: Boolean = true) =
        BatteryAlertPolicy.state(percent, plugged, full, low, fullOn)

    @Test fun lowBelowTwentyWhileNotCharging() {
        assertEquals(BatteryAlertState.LOW, state(19))
        assertEquals(BatteryAlertState.LOW, state(1))
        assertEquals(BatteryAlertState.NONE, state(20))
        assertEquals(BatteryAlertState.NONE, state(50))
    }

    @Test fun chargingIsNotLow() {
        assertEquals(BatteryAlertState.NONE, state(10, plugged = true))
    }

    @Test fun fullWhenPluggedInAndFullOrAtHundred() {
        assertEquals(BatteryAlertState.FULL, state(100, plugged = true))
        assertEquals(BatteryAlertState.FULL, state(97, plugged = true, full = true))
        assertEquals(BatteryAlertState.NONE, state(100, plugged = false))
        assertEquals(BatteryAlertState.NONE, state(97, plugged = true))
    }

    @Test fun switchesTurnEachAlertOff() {
        assertEquals(BatteryAlertState.NONE, state(10, low = false))
        assertEquals(BatteryAlertState.NONE, state(100, plugged = true, fullOn = false))
    }

    @Test fun commandsForTheBoard() {
        assertEquals("alert=0", BatteryAlertPolicy.command(BatteryAlertState.NONE))
        assertEquals("alert=1/60/0", BatteryAlertPolicy.command(BatteryAlertState.LOW))
        assertEquals("alert=2/60/10", BatteryAlertPolicy.command(BatteryAlertState.FULL))
    }
}

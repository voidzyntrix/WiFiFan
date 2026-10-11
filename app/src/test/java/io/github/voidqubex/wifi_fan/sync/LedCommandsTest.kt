package io.github.voidqubex.wifi_fan.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class LedCommandsTest {
    @Test fun formatsTwoLedCommands() {
        assertEquals("hh=0/100/100/240/100/60", LedCommands.pair(0f, 1f, 1f, 240f, 1f, 0.6f))
        assertEquals("hh=350/50/0/10/0/100", LedCommands.pair(-10f, 0.5f, -1f, 370f, 0f, 2f))
        assertEquals("split=1", LedCommands.split(true))
        assertEquals("split=0", LedCommands.split(false))
    }
}

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

    @Test fun formatsCandleCommands() {
        // Firmware < 1.3.0: brightness only.
        assertEquals("candle=60", LedCommands.candle(0.6f, options = false, smooth = true, hue = 19))
        // 1.3.0 - 1.6.0: smooth flag and hue, no style.
        assertEquals("candle=60/1/19", LedCommands.candle(0.6f, true, smooth = true, hue = 19))
        assertEquals("candle=15/0/30", LedCommands.candle(0.15f, true, smooth = false, hue = 30, twoCandles = true))
        // 1.6.1+: style appended (0 one flame, 1 two candles).
        assertEquals("candle=60/1/19/0", LedCommands.candle(0.6f, true, true, 19, styles = true, twoCandles = false))
        assertEquals("candle=100/0/10/1", LedCommands.candle(1f, true, false, 10, styles = true, twoCandles = true))
    }
}

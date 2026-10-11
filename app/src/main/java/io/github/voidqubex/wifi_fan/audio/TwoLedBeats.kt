package io.github.voidqubex.wifi_fan.audio

/**
 * Music with separate LEDs: every beat steps the hue on, and the new colour lands on the LEDs
 * in turn (LED1, LED2, LED1, ...), so the two leapfrog each other round the colour wheel. The
 * LED that took the beat is also the one that flashes.
 */
class TwoLedBeats(startHue: Float, private val step: Float = 47f) {
    var hue1 = norm(startHue)
        private set
    var hue2 = norm(startHue + step)
        private set
    private var latest = hue2
    private var next = 0

    /** A beat: returns the LED (0 = LED1, 1 = LED2) that got the new colour. */
    fun onBeat(): Int {
        latest = norm(latest + step)
        val led = next
        if (led == 0) hue1 = latest else hue2 = latest
        next = 1 - next
        return led
    }

    private fun norm(h: Float) = ((h % 360f) + 360f) % 360f
}

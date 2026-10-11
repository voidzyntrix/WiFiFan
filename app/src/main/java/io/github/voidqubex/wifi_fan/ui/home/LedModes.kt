package io.github.voidqubex.wifi_fan.ui.home

internal const val LED_MODE_SOLID = 0
internal const val LED_MODE_RAINBOW = 1
internal const val LED_MODE_CANDLE = 2
internal const val LED_MODE_BREATHE = 3
internal const val LED_MODE_OCEAN = 4
internal const val LED_MODE_PARTY = 5
internal const val LED_MODE_AURORA = 6
/** Microphone-reactive: loudness drives brightness, beats step the hue (app-side). */
internal const val LED_MODE_MUSIC = 7
/** Screen sync: the dominant screen colour (app-side, foreground service). */
internal const val LED_MODE_SCREEN = 8
/** Visualizer: bass, mids and treble of what the speakers play set the colour (app-side, foreground service). */
internal const val LED_MODE_VISUALIZER = 9

/** Board effects (firmware 1.4.0+): mode -> (button label, command). */
internal val LedEffects = listOf(
    Triple(LED_MODE_BREATHE, "Breathe", "breathe"),
    Triple(LED_MODE_OCEAN, "Ocean", "ocean"),
    Triple(LED_MODE_PARTY, "Party", "party"),
    Triple(LED_MODE_AURORA, "Aurora", "aurora")
)

/** Below this the LED is effectively off (1 % = 3 of 255), so there is nothing to preserve. */
internal const val MIN_VISIBLE_BRIGHTNESS = 0.01f

internal val LedPresets = listOf(
    0xFFFFFFFF.toInt(),
    0xFFFF3B30.toInt(),
    0xFFFF9500.toInt(),
    0xFFFFD60A.toInt(),
    0xFF34C759.toInt(),
    0xFF00C7BE.toInt(),
    0xFF0A84FF.toInt(),
    0xFFBF5AF2.toInt(),
    0xFFFF2D92.toInt()
)

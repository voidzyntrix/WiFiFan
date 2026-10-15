package io.github.voidqubex.wifi_fan.ui.home

import android.bluetooth.BluetoothProfile
import android.graphics.Color as AndroidColor
import io.github.voidqubex.wifi_fan.Commands
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.led.LedColor
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.sync.LedCommands
import kotlin.math.roundToInt

/** Everything the board shows: the mode, LED1's (and LED2's) colour, brightness and layout. */
internal data class LedState(
    val mode: Int,
    val hue: Float,
    val sat: Float,
    val kelvinMode: Boolean,
    val kelvin: Float,
    val bri: Float,
    /** Candle flame hue picked in the colour controls; null = the Settings candle colour. */
    val candleHue: Int?,
    /** Separate LEDs wanted (the board only has them on firmware 1.6.0+). */
    val separate: Boolean,
    val hue2: Float,
    val sat2: Float,
    val kelvinMode2: Boolean,
    val kelvin2: Float
) {
    /** This state as a scene (Music, Visualizer and Screen sync come back as Solid in their colour). */
    fun toScene(id: Long, name: String) = Scene(
        id = id, name = name, mode = if (Scene.canSave(mode)) mode else LED_MODE_SOLID,
        hue = hue, sat = sat, kelvinMode = kelvinMode, kelvin = kelvin, bri = bri,
        candleHue = if (mode == LED_MODE_CANDLE) candleHue else null,
        split = separate,
        hue2 = if (separate) hue2 else 0f, sat2 = if (separate) sat2 else 0f,
        kelvinMode2 = separate && kelvinMode2, kelvin2 = if (separate) kelvin2 else 4000f
    )
}

/** What the connected board's firmware understands. */
internal data class BoardCaps(
    val hsv: Boolean,          // 1.1.0: h=H/S/V
    val candle: Boolean,       // 1.2.0
    val options: Boolean,      // 1.3.0: candle/rainbow options
    val effects: Boolean,      // 1.4.0: breathe, ocean, party, aurora
    val split: Boolean,        // 1.6.0: two LEDs, chase
    val candleStyle: Boolean   // 1.6.1: one flame / two candles
) {
    companion object {
        fun of(version: String?): BoardCaps {
            fun atLeast(v: String) = version?.let { GitHubReleases.compareVersions(it, v) >= 0 } ?: false
            return BoardCaps(
                atLeast("1.1.0"), atLeast("1.2.0"), atLeast("1.3.0"),
                atLeast("1.4.0"), atLeast("1.6.0"), atLeast("1.6.1")
            )
        }
    }
}

/** The LED options from Settings that shape the candle and rainbow commands. */
internal data class LedOptions(
    val smoothCandle: Boolean,
    val candleHue: Int,
    val twoCandles: Boolean,
    val rainbowSeconds: Int
) {
    companion object {
        fun of(store: SettingsStore) =
            LedOptions(store.smoothCandle, store.candleHue, store.twoCandles, store.rainbowSeconds)
    }
}

/**
 * Turns a scene into board commands, with no UI involved: the home screen's scene chips and the
 * Auto light service both go through here, so a scene looks the same whoever applies it.
 */
internal object SceneApplier {
    /** The state after applying [scene] on top of [current]; `second` is false when the board can't run its mode. */
    fun resolve(scene: Scene, current: LedState, caps: BoardCaps): Pair<LedState, Boolean> {
        val supported = when (scene.mode) {
            LED_MODE_CANDLE -> caps.candle
            LED_MODE_BREATHE, LED_MODE_OCEAN, LED_MODE_PARTY, LED_MODE_AURORA -> caps.effects
            LED_MODE_CHASE -> caps.split
            else -> Scene.canSave(scene.mode)
        }
        val hs = if (scene.kelvinMode) LedColor.kelvinToHueSat(scene.kelvin) else floatArrayOf(scene.hue, scene.sat)
        var next = current.copy(
            mode = if (supported) scene.mode else LED_MODE_SOLID,
            hue = hs[0], sat = hs[1],
            kelvinMode = scene.kelvinMode,
            kelvin = if (scene.kelvinMode) scene.kelvin else current.kelvin,
            bri = scene.bri,
            candleHue = if (scene.mode == LED_MODE_CANDLE) scene.candleHue else null
        )
        if (scene.split == true) {
            val hs2 = if (scene.kelvinMode2) LedColor.kelvinToHueSat(scene.kelvin2) else floatArrayOf(scene.hue2, scene.sat2)
            next = next.copy(
                hue2 = hs2[0], sat2 = hs2[1], kelvinMode2 = scene.kelvinMode2,
                kelvin2 = if (scene.kelvinMode2) scene.kelvin2 else current.kelvin2
            )
        }
        // A scene saved Linked or Separate brings its layout back (older scenes keep the current one).
        val layout = scene.split
        if (caps.split && layout != null) next = next.copy(separate = layout)
        return next to supported
    }

    /**
     * The commands that show [state]: the layout first when it changes (`split=`), then the mode,
     * exactly as the home screen sends it.
     */
    fun commands(state: LedState, caps: BoardCaps, opts: LedOptions, layoutChanged: Boolean): List<String> {
        val twoLeds = state.separate && caps.split
        val v = (state.bri * 100).roundToInt()
        fun colour(): String = when {
            twoLeds -> LedCommands.pair(state.hue, state.sat, state.bri, state.hue2, state.sat2, state.bri)
            caps.hsv -> Commands.LED_HSV + LedCommands.hsv(state.hue, state.sat, state.bri)
            else -> AndroidColor.HSVToColor(floatArrayOf(state.hue, state.sat, state.bri)).let {
                "${Commands.LED}${AndroidColor.red(it)}/${AndroidColor.green(it)}/${AndroidColor.blue(it)}"
            }
        }
        fun effect(mode: Int) = "${AllLedEffects.first { it.first == mode }.third}=$v"
        val mode = when (state.mode) {
            LED_MODE_RAINBOW -> listOf(
                Commands.RAINBOW + "=${(state.sat * 100).roundToInt()}/$v" +
                    if (caps.options) "/${opts.rainbowSeconds}" else ""
            )
            LED_MODE_CANDLE -> listOf(
                LedCommands.candle(
                    state.bri, caps.options, opts.smoothCandle, state.candleHue ?: opts.candleHue,
                    caps.candleStyle, opts.twoCandles
                )
            )
            LED_MODE_BREATHE, LED_MODE_CHASE -> listOf(colour(), effect(state.mode))
            LED_MODE_OCEAN, LED_MODE_PARTY, LED_MODE_AURORA -> listOf(effect(state.mode))
            LED_MODE_MUSIC, LED_MODE_VISUALIZER, LED_MODE_SCREEN, LED_MODE_SOLAR -> emptyList()
            else -> listOf(colour())
        }
        return (if (caps.split && layoutChanged) listOf(LedCommands.split(state.separate)) else emptyList()) + mode
    }

    /**
     * Applies [scene] from outside the UI: reads the current state from [store], sends the
     * commands (only when [send] and the board is connected) and saves the new state, so the
     * home screen opens on it. Returns the new state and whether the board could run the mode.
     */
    fun apply(scene: Scene, ble: BleManager, store: SettingsStore, send: Boolean = true): Pair<LedState, Boolean> {
        val caps = BoardCaps.of(ble.firmwareVersion.value)
        val current = store.ledState()
        val (next, supported) = resolve(scene, current, caps)
        if (send && ble.connectionState.value == BluetoothProfile.STATE_CONNECTED) {
            commands(next, caps, LedOptions.of(store), layoutChanged = next.separate != current.separate)
                .forEach(ble::sendData)
        }
        store.saveLedState(next)
        return next to supported
    }
}

/** The LED state the home screen last saved. */
internal fun SettingsStore.ledState(): LedState {
    val hsv = FloatArray(3).also { AndroidColor.colorToHSV(ledColor, it) }
    val hs = if (ledKelvinMode) LedColor.kelvinToHueSat(ledKelvin) else floatArrayOf(hsv[0], hsv[1])
    val k2 = led2KelvinMode
    val hs2 = if (k2) LedColor.kelvinToHueSat(led2Kelvin) else floatArrayOf(led2Hue, led2Sat)
    return LedState(
        mode = ledMode, hue = hs[0], sat = hs[1], kelvinMode = ledKelvinMode, kelvin = ledKelvin,
        bri = ledBrightness, candleHue = null, separate = separateLeds,
        hue2 = hs2[0], sat2 = hs2[1], kelvinMode2 = k2, kelvin2 = led2Kelvin
    )
}

internal fun SettingsStore.saveLedState(s: LedState) {
    // Full value: only hue and saturation are read back (brightness is stored on its own).
    ledColor = AndroidColor.HSVToColor(floatArrayOf(s.hue, s.sat, 1f))
    ledBrightness = s.bri
    ledMode = s.mode
    ledKelvinMode = s.kelvinMode
    ledKelvin = s.kelvin
    separateLeds = s.separate
    led2Hue = s.hue2
    led2Sat = s.sat2
    led2KelvinMode = s.kelvinMode2
    led2Kelvin = s.kelvin2
}

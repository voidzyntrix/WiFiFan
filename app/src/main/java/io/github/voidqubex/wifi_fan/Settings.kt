package io.github.voidqubex.wifi_fan

import android.content.Context
import androidx.compose.ui.graphics.toArgb
import io.github.voidqubex.wifi_fan.ui.theme.CornerScales
import io.github.voidqubex.wifi_fan.ui.theme.DefaultAccent

/** Which color palette the theme uses. */
enum class AppColorScheme { MONOCHROME, TINTED, COLORED }

/** What sits behind the UI. SIMPLE is the particles (the name is what older versions saved). */
enum class AppBackground { SIMPLE, IMAGE, AURORA, FLUID, PLAIN }

/** A board the app has connected to: its Bluetooth MAC address and the name it advertises. */
data class PairedBoard(val address: String, val bleName: String?)

/**
 * Thin SharedPreferences wrapper for the handful of user preferences.
 * No extra dependencies — values are read once at startup and written on change.
 */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("wifi_fan_settings", Context.MODE_PRIVATE)

    var colorScheme: AppColorScheme
        get() = runCatching {
            AppColorScheme.valueOf(prefs.getString(KEY_COLOR, AppColorScheme.MONOCHROME.name)!!)
        }.getOrDefault(AppColorScheme.MONOCHROME)
        set(value) { prefs.edit().putString(KEY_COLOR, value.name).apply() }

    /** Accent color used by the "Colored" scheme, stored as an ARGB int. */
    var accentColor: Int
        get() = prefs.getInt(KEY_ACCENT, DefaultAccent.toArgb())
        set(value) { prefs.edit().putInt(KEY_ACCENT, value).apply() }

    var background: AppBackground
        get() = runCatching {
            AppBackground.valueOf(prefs.getString(KEY_BACKGROUND, AppBackground.SIMPLE.name)!!)
        }.getOrDefault(AppBackground.SIMPLE)
        set(value) { prefs.edit().putString(KEY_BACKGROUND, value.name).apply() }

    /** Whether the LED dialog's sliders and hex code follow the rainbow cycle. */
    var rainbowSync: Boolean
        get() = prefs.getBoolean(KEY_RAINBOW_SYNC, true)
        set(value) { prefs.edit().putBoolean(KEY_RAINBOW_SYNC, value).apply() }

    /** Last LED state, so the LED dialog reopens where it was left (also after a restart). */
    var ledColor: Int
        get() = prefs.getInt(KEY_LED_COLOR, android.graphics.Color.WHITE)
        set(value) { prefs.edit().putInt(KEY_LED_COLOR, value).apply() }
    var ledBrightness: Float
        get() = prefs.getFloat(KEY_LED_BRI, 1f)
        set(value) { prefs.edit().putFloat(KEY_LED_BRI, value).apply() }
    var ledMode: Int
        get() = prefs.getInt(KEY_LED_MODE, 0)
        set(value) { prefs.edit().putInt(KEY_LED_MODE, value).apply() }
    var ledKelvinMode: Boolean
        get() = prefs.getBoolean(KEY_LED_KMODE, false)
        set(value) { prefs.edit().putBoolean(KEY_LED_KMODE, value).apply() }
    var ledKelvin: Float
        get() = prefs.getFloat(KEY_LED_KELVIN, 4000f)
        set(value) { prefs.edit().putFloat(KEY_LED_KELVIN, value).apply() }

    /**
     * Two-LED boards (firmware 1.6.0+): Separate gives each LED its own colour. The board itself
     * forgets this at every power-up, so the app sends it on each connect.
     */
    var separateLeds: Boolean
        get() = prefs.getBoolean("separate_leds", false)
        set(value) { prefs.edit().putBoolean("separate_leds", value).apply() }
    /** LED2's colour in Separate mode: hue/saturation, or a colour temperature. */
    var led2Hue: Float
        get() = prefs.getFloat("led2_hue", 210f)
        set(value) { prefs.edit().putFloat("led2_hue", value).apply() }
    var led2Sat: Float
        get() = prefs.getFloat("led2_sat", 1f)
        set(value) { prefs.edit().putFloat("led2_sat", value).apply() }
    var led2KelvinMode: Boolean
        get() = prefs.getBoolean("led2_kelvin_mode", false)
        set(value) { prefs.edit().putBoolean("led2_kelvin_mode", value).apply() }
    var led2Kelvin: Float
        get() = prefs.getFloat("led2_kelvin", 4000f)
        set(value) { prefs.edit().putFloat("led2_kelvin", value).apply() }

    /** Candle mode: smooth (slow, gentle) instead of the lively flicker. */
    var smoothCandle: Boolean
        get() = prefs.getBoolean(KEY_SMOOTH_CANDLE, false)
        set(value) { prefs.edit().putBoolean(KEY_SMOOTH_CANDLE, value).apply() }
    /**
     * Candle with Separate LEDs (firmware 1.6.1+): two independent candles instead of one
     * flame (LED1 core, LED2 tip).
     */
    var twoCandles: Boolean
        get() = prefs.getBoolean("candle_two_candles", false)
        set(value) { prefs.edit().putBoolean("candle_two_candles", value).apply() }
    /** Seconds the rainbow takes for one trip round the colour wheel. */
    var rainbowSeconds: Int
        get() = prefs.getInt(KEY_RAINBOW_SECONDS, 15)
        set(value) { prefs.edit().putInt(KEY_RAINBOW_SECONDS, value).apply() }
    /** How long the LED takes to fade to a new colour, in ms. */
    var fadeMs: Int
        get() = prefs.getInt(KEY_FADE_MS, 1500)
        set(value) { prefs.edit().putInt(KEY_FADE_MS, value).apply() }

    /** Candle flame hue in degrees (19 warm, 30 amber, 10 ember). */
    var candleHue: Int
        get() = prefs.getInt(KEY_CANDLE_HUE, 19)
        set(value) { prefs.edit().putInt(KEY_CANDLE_HUE, value).apply() }
    /** Whether a settings category (by [key]) is minimised. */
    fun categoryCollapsed(key: String): Boolean = prefs.getBoolean("collapsed_$key", false)
    fun setCategoryCollapsed(key: String, value: Boolean) {
        prefs.edit().putBoolean("collapsed_$key", value).apply()
    }
    /** App font: JetBrains Mono instead of the system font. */
    var monoFont: Boolean
        get() = prefs.getBoolean("mono_font", false)
        set(value) { prefs.edit().putBoolean("mono_font", value).apply() }
    /** Corner roundness: 0 Square, 1 Small, 2 Medium, 3 Large, 4 Custom. */
    var cornerStyle: Int
        get() = prefs.getInt("corner_style", 2).coerceIn(0, 4)
        set(value) { prefs.edit().putInt("corner_style", value).apply() }
    /** Corner multiplier for the Custom style (0 square .. 2). */
    var customCorner: Float
        get() = prefs.getFloat("custom_corner", 1f)
        set(value) { prefs.edit().putFloat("custom_corner", value).apply() }
    /** The corner multiplier the current style stands for. */
    val cornerScale: Float
        get() = cornerStyle.let { if (it == 4) customCorner else CornerScales[it] }
    /** LED preview stays a perfect circle regardless of the corner setting. */
    var roundLedPreview: Boolean
        get() = prefs.getBoolean("round_led_preview", true)
        set(value) { prefs.edit().putBoolean("round_led_preview", value).apply() }
    /** Pure-black (OLED) dark theme. */
    var pureBlack: Boolean
        get() = prefs.getBoolean("pure_black", false)
        set(value) { prefs.edit().putBoolean("pure_black", value).apply() }
    /** Refractive glass cards (clear, bent at the edges) instead of frosted ones. */
    var refractiveGlass: Boolean
        get() = prefs.getBoolean("refractive_glass", false)
        set(value) { prefs.edit().putBoolean("refractive_glass", value).apply() }
    /** Music mode: microphone sensitivity 0..1. */
    var musicSensitivity: Float
        get() = prefs.getFloat("music_sensitivity", 0.5f)
        set(value) { prefs.edit().putFloat("music_sensitivity", value).apply() }
    /** Music mode: keep the picked colour instead of stepping the hue on beats. */
    var musicKeepColour: Boolean
        get() = prefs.getBoolean("music_keep_colour", false)
        set(value) { prefs.edit().putBoolean("music_keep_colour", value).apply() }
    /** Newest app version whose "What's new" the user has seen (null before the first launch). */
    var lastSeenVersion: String?
        get() = prefs.getString("last_seen_version", null)
        set(value) { prefs.edit().putString("last_seen_version", value).apply() }
    var keepScreenOn: Boolean
        get() = prefs.getBoolean(KEY_KEEP_SCREEN_ON, false)
        set(value) { prefs.edit().putBoolean(KEY_KEEP_SCREEN_ON, value).apply() }
    /** Dialog at launch when an app or firmware update is available. */
    var updatePrompts: Boolean
        get() = prefs.getBoolean(KEY_UPDATE_PROMPTS, true)
        set(value) { prefs.edit().putBoolean(KEY_UPDATE_PROMPTS, value).apply() }

    /** Light haptic ticks on sliders and taps on toggles, pills and buttons. */
    var haptics: Boolean
        get() = prefs.getBoolean("haptics", true)
        set(value) { prefs.edit().putBoolean("haptics", value).apply() }
    /** How strong the haptics are, 0.1 (faint) to 1 (full). */
    var hapticStrength: Float
        get() = prefs.getFloat("haptic_strength", 0.7f).coerceIn(0.1f, 1f)
        set(value) { prefs.edit().putFloat("haptic_strength", value).apply() }
    /** Music and Visualizer: a short brightness spike on every beat. */
    var beatFlash: Boolean
        get() = prefs.getBoolean("beat_flash", true)
        set(value) { prefs.edit().putBoolean("beat_flash", value).apply() }

    /** The firmware version each board last reported, by MAC address (known before it answers again). */
    var boardVersions: Map<String, String>
        get() = runCatching {
            val o = org.json.JSONObject(prefs.getString("board_versions", null) ?: "{}")
            o.keys().asSequence().associateWith { o.getString(it) }
        }.getOrDefault(emptyMap())
        set(value) {
            prefs.edit().putString("board_versions", org.json.JSONObject(value).toString()).apply()
        }

    /** App-side names for boards, keyed by Bluetooth MAC address (the board itself isn't renamed). */
    var boardNames: Map<String, String>
        get() = runCatching {
            val o = org.json.JSONObject(prefs.getString("board_names", null) ?: "{}")
            o.keys().asSequence().associateWith { o.getString(it) }
        }.getOrDefault(emptyMap())
        set(value) {
            prefs.edit().putString("board_names", org.json.JSONObject(value).toString()).apply()
        }

    /**
     * Boards connected to before, in the order they were paired. Before pairing existed, the
     * boards that were given a name count as paired.
     */
    var pairedBoards: List<PairedBoard>
        get() {
            val json = prefs.getString("paired_boards", null)
                ?: return boardNames.keys.map { PairedBoard(it, null) }
            return runCatching {
                val a = org.json.JSONArray(json)
                (0 until a.length()).map { i ->
                    val o = a.getJSONObject(i)
                    PairedBoard(o.getString("address"), o.optString("name").ifEmpty { null })
                }
            }.getOrDefault(emptyList())
        }
        set(value) {
            val a = org.json.JSONArray()
            value.forEach { a.put(org.json.JSONObject().put("address", it.address).put("name", it.bleName ?: "")) }
            prefs.edit().putString("paired_boards", a.toString()).apply()
        }

    /** Saved scenes as JSON; null until the defaults were seeded. */
    var scenesJson: String?
        get() = prefs.getString("scenes", null)
        set(value) { prefs.edit().putString("scenes", value).apply() }

    /** Auto light: reading light while the phone is in a hand, night light when it is down and locked. */
    var autoLight: Boolean
        get() = prefs.getBoolean("auto_light", false)
        set(value) { prefs.edit().putBoolean("auto_light", value).apply() }
    /** Scene ids for In hand and for Phone down & locked (the default Read and Night scenes). */
    var autoHandScene: Long
        get() = prefs.getLong("auto_hand_scene", 2L)
        set(value) { prefs.edit().putLong("auto_hand_scene", value).apply() }
    var autoNightScene: Long
        get() = prefs.getLong("auto_night_scene", 1L)
        set(value) { prefs.edit().putLong("auto_night_scene", value).apply() }
    /** Minutes the phone must stay locked (or its screen off) before Night: 1, 2 or 5. */
    var autoWaitMinutes: Int
        get() = prefs.getInt("auto_wait_minutes", 2)
        set(value) { prefs.edit().putInt("auto_wait_minutes", value).apply() }
    /** Night the moment the phone is locked or the screen goes off, with no wait. */
    var autoNightNoWait: Boolean
        get() = prefs.getBoolean("auto_night_no_wait", false)
        set(value) { prefs.edit().putBoolean("auto_night_no_wait", value).apply() }
    /** Auto light follows the room's light (the light sensor) instead of the lock and screen. */
    var autoRoomLight: Boolean
        get() = prefs.getBoolean("auto_room_light", false)
        set(value) { prefs.edit().putBoolean("auto_room_light", value).apply() }
    /** Room light: below this many lux the room counts as dark (bright from twice that, at least +15). */
    var autoDarkLux: Float
        get() = prefs.getFloat("auto_dark_lux", 30f).coerceIn(2f, 150f)
        set(value) { prefs.edit().putFloat("auto_dark_lux", value).apply() }
    /** Scene ids for a dark and a bright room (the default Night and Read scenes). */
    var autoDarkScene: Long
        get() = prefs.getLong("auto_dark_scene", 1L)
        set(value) { prefs.edit().putLong("auto_dark_scene", value).apply() }
    var autoBrightScene: Long
        get() = prefs.getLong("auto_bright_scene", 2L)
        set(value) { prefs.edit().putLong("auto_bright_scene", value).apply() }
    /** The light from before Auto light first changed it (a scene as JSON), brought back when it is turned off. */
    var autoSnapshot: String?
        get() = prefs.getString("auto_snapshot", null)
        set(value) { prefs.edit().putString("auto_snapshot", value).apply() }

    private companion object {
        const val KEY_CANDLE_HUE = "candle_hue"
        const val KEY_KEEP_SCREEN_ON = "keep_screen_on"
        const val KEY_UPDATE_PROMPTS = "update_toasts"   // the old name keeps the saved choice
        const val KEY_SMOOTH_CANDLE = "smooth_candle"
        const val KEY_RAINBOW_SECONDS = "rainbow_seconds"
        const val KEY_FADE_MS = "fade_ms"
        const val KEY_LED_COLOR  = "led_color"
        const val KEY_LED_BRI    = "led_brightness"
        const val KEY_LED_MODE   = "led_mode"
        const val KEY_LED_KMODE  = "led_kelvin_mode"
        const val KEY_LED_KELVIN = "led_kelvin"
        const val KEY_RAINBOW_SYNC = "rainbow_sync"
        const val KEY_COLOR      = "color_scheme"
        const val KEY_ACCENT     = "accent_color"
        const val KEY_BACKGROUND = "background_style"
    }
}

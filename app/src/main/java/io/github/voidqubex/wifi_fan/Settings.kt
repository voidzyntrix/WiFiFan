package io.github.voidqubex.wifi_fan

import android.content.Context
import androidx.compose.ui.graphics.toArgb
import io.github.voidqubex.wifi_fan.ui.theme.DefaultAccent

/** Which control-screen layout to render. The Simple layout is always frosted glass. */
enum class UiLayout { SIMPLE, CLASSIC }

/** Which color palette the theme uses. */
enum class AppColorScheme { MONOCHROME, COLORED }

/** What sits behind the UI. */
enum class AppBackground { SIMPLE, IMAGE }

/**
 * Thin SharedPreferences wrapper for the handful of user preferences.
 * No extra dependencies — values are read once at startup and written on change.
 */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("wifi_fan_settings", Context.MODE_PRIVATE)

    var uiLayout: UiLayout
        get() = runCatching {
            UiLayout.valueOf(prefs.getString(KEY_LAYOUT, UiLayout.SIMPLE.name)!!)
        }.getOrDefault(UiLayout.SIMPLE)
        set(value) { prefs.edit().putString(KEY_LAYOUT, value.name).apply() }

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

    private companion object {
        const val KEY_LED_COLOR  = "led_color"
        const val KEY_LED_BRI    = "led_brightness"
        const val KEY_LED_MODE   = "led_mode"
        const val KEY_LED_KMODE  = "led_kelvin_mode"
        const val KEY_LED_KELVIN = "led_kelvin"
        const val KEY_LAYOUT     = "ui_layout"
        const val KEY_RAINBOW_SYNC = "rainbow_sync"
        const val KEY_COLOR      = "color_scheme"
        const val KEY_ACCENT     = "accent_color"
        const val KEY_BACKGROUND = "background_style"
    }
}

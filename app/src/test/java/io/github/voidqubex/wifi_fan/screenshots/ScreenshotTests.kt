package io.github.voidqubex.wifi_fan.screenshots

import android.bluetooth.BluetoothProfile
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import io.github.voidqubex.wifi_fan.AppBackground
import io.github.voidqubex.wifi_fan.AppColorScheme
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ui.connect.ConnectScreen
import io.github.voidqubex.wifi_fan.ui.home.BleControlScreen
import io.github.voidqubex.wifi_fan.ui.settings.SettingsScreen
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import io.github.voidqubex.wifi_fan.ui.theme.DefaultAccent
import io.github.voidqubex.wifi_fan.ui.theme.GlowTheme
import io.github.voidqubex.wifi_fan.ui.whatsnew.WhatsNewCard
import io.github.voidqubex.wifi_fan.ui.whatsnew.WhatsNewNotes
import io.github.voidqubex.wifi_fan.ui.whatsnew.markdownToText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** The looks every screen is captured in. */
enum class Look(val id: String, val dark: Boolean, val scheme: AppColorScheme) {
    DARK_MONO("dark-mono", true, AppColorScheme.MONOCHROME),
    DARK_COLOURED("dark-coloured", true, AppColorScheme.COLORED),
    LIGHT_MONO("light-mono", false, AppColorScheme.MONOCHROME),
}

/**
 * Screenshots of the main screens, rendered on the JVM (Robolectric native graphics).
 * Run `./gradlew recordRoborazziDebug`; PNGs land in app/build/outputs/roborazzi.
 * Subclasses pick the screen size.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
abstract class ScreenshotTests(private val size: String) {
    @get:Rule
    val compose = createComposeRule()

    private fun shot(
        name: String,
        look: Look,
        oled: Boolean = false,
        prepare: (SettingsStore) -> Unit = {},
        content: @Composable () -> Unit
    ) {
        val store = SettingsStore(ApplicationProvider.getApplicationContext())
        store.ledColor = 0xFFFF9500.toInt()
        store.ledBrightness = 0.8f
        store.lastSeenVersion = "999.0.0"   // no "What's new" dialog on top
        prepare(store)
        AppLook.monoFont = false
        AppLook.cornerScale = 1f
        AppLook.roundLedPreview = true
        AppLook.pureBlack = oled
        compose.mainClock.autoAdvance = false   // infinite animations: step the clock by hand
        compose.setContent {
            GlowTheme(
                darkTheme = look.dark,
                colored = look.scheme == AppColorScheme.COLORED,
                pureMono = look.scheme == AppColorScheme.MONOCHROME,
                accent = DefaultAccent
            ) {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) { content() }
            }
        }
        compose.mainClock.advanceTimeBy(2_000)
        compose.onRoot().captureRoboImage("build/outputs/roborazzi/${size}_${name}_${look.id}.png")
    }

    /** A BleManager that reports a connected board with firmware [version]. */
    private fun connectedBle(context: android.content.Context, version: String = "1.4.0"): BleManager {
        val ble = BleManager(context)
        fun <T> flow(name: String): MutableStateFlow<T> {
            val f = BleManager::class.java.getDeclaredField(name).apply { isAccessible = true }
            @Suppress("UNCHECKED_CAST")
            return f.get(ble) as MutableStateFlow<T>
        }
        flow<Int>("_connectionState").value = BluetoothProfile.STATE_CONNECTED
        flow<String?>("_firmwareVersion").value = version
        return ble
    }

    @Composable
    private fun Home(look: Look) {
        val context = LocalContext.current
        val ble = remember { connectedBle(context) }
        val ota = remember { OtaManager(ble, CoroutineScope(Dispatchers.Main)) }
        BleControlScreen(
            bleManager = ble,
            otaManager = ota,
            colorScheme = look.scheme,
            accentColor = DefaultAccent.toArgb(),
            background = AppBackground.SIMPLE,
            rainbowSync = true,
            onRainbowSyncChange = {},
            onColorChange = {},
            onAccentChange = {},
            onBackgroundChange = {}
        )
    }

    @Composable
    private fun Settings(look: Look) {
        val context = LocalContext.current
        val ble = remember { BleManager(context) }
        val ota = remember { OtaManager(ble, CoroutineScope(Dispatchers.Main)) }
        SettingsScreen(
            colorScheme = look.scheme,
            accentColor = DefaultAccent.toArgb(),
            background = AppBackground.SIMPLE,
            rainbowSync = true,
            onRainbowSyncChange = {},
            smoothCandle = false,
            onSmoothCandleChange = {},
            rainbowSeconds = 15,
            onRainbowSecondsChange = {},
            fadeMs = 1500,
            onFadeMsChange = {},
            candleHue = 19,
            onCandleHueChange = {},
            keepScreenOn = false,
            onKeepScreenOnChange = {},
            updateToasts = true,
            onUpdateToastsChange = {},
            onColorChange = {},
            onAccentChange = {},
            onBackgroundChange = {},
            otaManager = ota,
            boardVersion = "1.4.0",
            isConnected = true,
            onBack = {}
        )
    }

    @Composable
    private fun Connect(look: Look) {
        ConnectScreen(
            connectionState = BluetoothProfile.STATE_DISCONNECTED,
            isScanning = false,
            devices = emptySet(),
            picking = false,
            mono = look.scheme == AppColorScheme.TINTED,
            onScan = {}, onPick = {}, onCancel = {}, onSettings = {}
        )
    }

    @Test fun homeDarkMono() = shot("home", Look.DARK_MONO) { Home(Look.DARK_MONO) }
    @Test fun homeDarkColoured() = shot("home", Look.DARK_COLOURED) { Home(Look.DARK_COLOURED) }
    @Test fun homeLight() = shot("home", Look.LIGHT_MONO) { Home(Look.LIGHT_MONO) }

    @Test fun settingsDarkMono() = shot("settings", Look.DARK_MONO) { Settings(Look.DARK_MONO) }
    @Test fun settingsDarkColoured() = shot("settings", Look.DARK_COLOURED) { Settings(Look.DARK_COLOURED) }
    @Test fun settingsLight() = shot("settings", Look.LIGHT_MONO) { Settings(Look.LIGHT_MONO) }

    @Test fun connectDarkMono() = shot("connect", Look.DARK_MONO) { Connect(Look.DARK_MONO) }
    @Test fun connectDarkColoured() = shot("connect", Look.DARK_COLOURED) { Connect(Look.DARK_COLOURED) }
    @Test fun connectLight() = shot("connect", Look.LIGHT_MONO) { Connect(Look.LIGHT_MONO) }

    // New UI bits.
    @Test fun homeMusicDarkMono() = shot("home-music", Look.DARK_MONO, prepare = { it.ledMode = 7 }) {
        Home(Look.DARK_MONO)
    }

    @Test fun homeOled() = shot("home-oled", Look.DARK_MONO, oled = true) { Home(Look.DARK_MONO) }

    @Test fun whatsNewDarkColoured() = shot("whats-new", Look.DARK_COLOURED) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            WhatsNewCard(
                version = "1.9.0",
                notes = WhatsNewNotes.Loaded(
                    markdownToText(
                        "## Changes\n\n- **Music** mode: the LED follows the beat\n" +
                            "- Screen sync mode\n- Pure black (OLED) dark mode\n" +
                            "- [Round LED preview](https://example.invalid) option"
                    )
                ),
                onDismiss = {}
            )
        }
    }
}

@Config(sdk = [35], qualifiers = "w360dp-h780dp-xxhdpi")
class Phone360Screenshots : ScreenshotTests("360x780")

@Config(sdk = [35], qualifiers = "w411dp-h891dp-420dpi")
class Phone411Screenshots : ScreenshotTests("411x891")

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
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import io.github.voidqubex.wifi_fan.AppBackground
import io.github.voidqubex.wifi_fan.AppColorScheme
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.auto.AutoLight
import io.github.voidqubex.wifi_fan.auto.AutoState
import io.github.voidqubex.wifi_fan.auto.AutoStatus
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ui.components.ActionsDialogCard
import io.github.voidqubex.wifi_fan.ui.components.NameDialogCard
import io.github.voidqubex.wifi_fan.ui.connect.ConnectScreen
import io.github.voidqubex.wifi_fan.ui.connect.DeviceEntry
import io.github.voidqubex.wifi_fan.ui.home.VisualizerPanel
import io.github.voidqubex.wifi_fan.ui.home.BleControlScreen
import io.github.voidqubex.wifi_fan.ui.settings.SettingsScreen
import io.github.voidqubex.wifi_fan.ui.settings.UpdateDialogCard
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
        after: () -> Unit = {},
        content: @Composable () -> Unit
    ) {
        val store = SettingsStore(ApplicationProvider.getApplicationContext())
        store.ledColor = 0xFFFF9500.toInt()
        store.ledBrightness = 0.8f
        store.lastSeenVersion = "999.0.0"   // no "What's new" dialog on top
        store.boardNames = mapOf(BOARD_ADDRESS to "Desk lamp")
        store.scenesJson = null             // the default scenes
        store.autoLight = false
        AutoLight.status.value = null
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
        after()
        compose.mainClock.advanceTimeBy(1_000)
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
        flow<String?>("_deviceAddress").value = BOARD_ADDRESS
        flow<String?>("_deviceName").value = "JDY-23"
        return ble
    }

    @Composable
    private fun Home(look: Look, version: String = "1.4.0") {
        val context = LocalContext.current
        val ble = remember { connectedBle(context, version) }
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
    private fun Settings(look: Look, version: String = "1.4.0", separate: Boolean = false, autoLight: Boolean = false) {
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
            updatePrompts = true,
            onUpdatePromptsChange = {},
            onColorChange = {},
            onAccentChange = {},
            onBackgroundChange = {},
            otaManager = ota,
            boardVersion = version,
            isConnected = true,
            onBack = {},
            separateLeds = separate,
            autoLight = autoLight
        )
    }

    @Composable
    private fun Connect(look: Look, picking: Boolean = false) {
        ConnectScreen(
            connectionState = BluetoothProfile.STATE_DISCONNECTED,
            isScanning = false,
            devices = if (picking) listOf(
                DeviceEntry(BOARD_ADDRESS, "JDY-23"),
                DeviceEntry("C8:47:8C:00:12:34", "JDY-23"),
                DeviceEntry("5D:21:9A:7F:00:01", null)
            ) else emptyList(),
            picking = picking,
            mono = look.scheme == AppColorScheme.TINTED,
            onScan = {}, onPick = {}, onCancel = {}, onSettings = {},
            names = mapOf(BOARD_ADDRESS to "Desk lamp")
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

    // Scenes, board names, beat flash (1.11.0).
    @Test fun homeNightSceneDarkColoured() = shot(
        "home-scene-night", Look.DARK_COLOURED,
        prepare = { it.ledMode = 2; it.ledBrightness = 0.15f }
    ) { Home(Look.DARK_COLOURED) }

    @Test fun homeMusicLight() = shot("home-music", Look.LIGHT_MONO, prepare = { it.ledMode = 7 }) {
        Home(Look.LIGHT_MONO)
    }

    @Test fun connectListDarkMono() = shot("connect-list", Look.DARK_MONO) { Connect(Look.DARK_MONO, picking = true) }

    @Test fun renameDialogDarkMono() = shot("rename-dialog", Look.DARK_MONO) {
        DialogBox {
            NameDialogCard(
                title = "Name this board",
                subtitle = "Shown in Glow only. Leave it empty to use the Bluetooth name (JDY-23).",
                initial = "Desk lamp",
                placeholder = "JDY-23",
                allowEmpty = true,
                onDismiss = {}, onSave = {}
            )
        }
    }

    @Test fun newSceneDialogDarkColoured() = shot("scene-dialog", Look.DARK_COLOURED) {
        DialogBox {
            NameDialogCard(
                title = "Save scene",
                subtitle = "Saves the mode, colour and brightness you have now.",
                initial = "",
                placeholder = "4000 K",
                allowEmpty = true,
                onDismiss = {}, onSave = {}
            )
        }
    }

    @Test fun sceneMenuLight() = shot("scene-menu", Look.LIGHT_MONO) {
        DialogBox {
            ActionsDialogCard(
                title = "Night",
                subtitle = "Scene",
                actions = listOf("Rename" to {}, "Update to the current light" to {}, "Delete" to {}),
                onDismiss = {}
            )
        }
    }

    @Test fun visualizerPanelDarkColoured() = shot("visualizer-panel", Look.DARK_COLOURED) {
        Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
            VisualizerPanel(
                level = 0.6f, running = true, sensitivity = 0.5f,
                onSensitivity = {}, onSensitivityDone = {},
                beatFlash = true, onBeatFlash = {}, onStop = {}
            )
        }
    }

    // Two LEDs, Separate (1.12.0): two-colour preview, LED selector, Settings > LEDs.
    private fun separate(store: SettingsStore) {
        store.separateLeds = true
        store.led2Hue = 205f
        store.led2Sat = 1f
    }

    @Test fun homeSeparateDarkMono() = shot("home-separate", Look.DARK_MONO, prepare = ::separate) {
        Home(Look.DARK_MONO, "1.6.0")
    }

    @Test fun homeSeparateDarkColoured() = shot("home-separate", Look.DARK_COLOURED, prepare = ::separate) {
        Home(Look.DARK_COLOURED, "1.6.0")
    }

    @Test fun homeSeparateLight() = shot("home-separate", Look.LIGHT_MONO, prepare = ::separate) {
        Home(Look.LIGHT_MONO, "1.6.0")
    }

    @Test fun homeSeparateColoursDarkColoured() = shot(
        "home-separate-colours", Look.DARK_COLOURED, prepare = ::separate,
        after = { compose.onNodeWithText("LED 2").performScrollTo() }
    ) { Home(Look.DARK_COLOURED, "1.6.0") }

    @Test fun homeSeparateRainbowDarkMono() = shot(
        "home-separate-rainbow", Look.DARK_MONO,
        prepare = { separate(it); it.ledMode = 1 }
    ) { Home(Look.DARK_MONO, "1.6.0") }

    @Test fun settingsLedsDarkColoured() = shot("settings-leds", Look.DARK_COLOURED) {
        Settings(Look.DARK_COLOURED, version = "1.6.0", separate = true)
    }

    @Test fun settingsLedsLight() = shot("settings-leds", Look.LIGHT_MONO) {
        Settings(Look.LIGHT_MONO, version = "1.6.0", separate = true)
    }

    // One-flame candle (1.12.1): Candle style pill in Settings, core/tip preview on Home.
    @Test fun settingsCandleStyleDarkColoured() = shot("settings-candle-style", Look.DARK_COLOURED) {
        Settings(Look.DARK_COLOURED, version = "1.6.1", separate = true)
    }

    @Test fun homeSeparateCandleDarkMono() = shot(
        "home-separate-candle", Look.DARK_MONO,
        prepare = { separate(it); it.ledMode = 2 }
    ) { Home(Look.DARK_MONO, "1.6.1") }

    // Auto light (1.13.0): Settings card, home toggle and status line.
    // Board LED minimised so the card is on screen (performScrollTo waits on a scroll animation
    // that never ends with the paused test clock).
    private fun boardCollapsed(store: SettingsStore) = store.setCategoryCollapsed("board", true)

    @Test fun settingsAutoLightDarkColoured() = shot(
        "settings-auto-light", Look.DARK_COLOURED, prepare = ::boardCollapsed
    ) { Settings(Look.DARK_COLOURED, autoLight = true) }

    @Test fun settingsAutoLightLight() = shot(
        "settings-auto-light", Look.LIGHT_MONO, prepare = ::boardCollapsed
    ) { Settings(Look.LIGHT_MONO, autoLight = true) }

    private fun autoReading(store: SettingsStore) {
        store.autoLight = true
        // The Read scene showing: 4000 K at 80 %.
        store.ledMode = 0
        store.ledKelvinMode = true
        store.ledKelvin = 4000f
        store.ledBrightness = 0.8f
        AutoLight.status.value = AutoStatus(AutoState.IN_HAND, paused = false, sceneName = "Read")
    }

    @Test fun homeAutoLightDarkMono() = shot("home-auto-light", Look.DARK_MONO, prepare = ::autoReading) {
        Home(Look.DARK_MONO)
    }

    @Test fun homeAutoLightDarkColoured() = shot("home-auto-light", Look.DARK_COLOURED, prepare = ::autoReading) {
        Home(Look.DARK_COLOURED)
    }

    @Composable
    private fun DialogBox(content: @Composable () -> Unit) {
        Box(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.4f)).padding(24.dp),
            contentAlignment = Alignment.Center
        ) { content() }
    }

    @Test fun updateDialogDarkColoured() = shot("update-dialog", Look.DARK_COLOURED) {
        DialogBox {
            UpdateDialogCard(
                title = "Update available",
                subtitle = "Glow v1.14.0 → v1.15.0",
                message = "Glow downloads the update, then Android asks you to confirm. " +
                    "The app closes when it's done; open it again.",
                actionLabel = "Update",
                onDismiss = {}
            )
        }
    }

    @Test fun updateDialogFirmwareLight() = shot("update-dialog-board", Look.LIGHT_MONO) {
        DialogBox {
            UpdateDialogCard(
                title = "Update available",
                subtitle = "Board firmware v1.6.1 → v1.6.2",
                message = "The app sends the new firmware over Bluetooth. Keep it open until it's done.",
                actionLabel = "Update",
                onDismiss = {}
            )
        }
    }

    @Test fun updateDialogProgressDarkMono() = shot("update-progress", Look.DARK_MONO) {
        DialogBox {
            UpdateDialogCard(
                title = "Updating Glow",
                subtitle = "Glow v1.14.0 → v1.15.0",
                message = "Downloading… 42 %",
                working = true,
                progress = 0.42f,
                onDismiss = {}
            )
        }
    }

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

private const val BOARD_ADDRESS = "C8:47:8C:4A:1B:2E"

@Config(sdk = [35], qualifiers = "w360dp-h780dp-xxhdpi")
class Phone360Screenshots : ScreenshotTests("360x780")

@Config(sdk = [35], qualifiers = "w411dp-h891dp-420dpi")
class Phone411Screenshots : ScreenshotTests("411x891")

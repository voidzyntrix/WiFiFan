package io.github.voidqubex.wifi_fan

import android.os.Build
import android.annotation.SuppressLint
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import io.github.voidqubex.wifi_fan.auto.AutoLight
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.ui.home.BleControlScreen
import io.github.voidqubex.wifi_fan.ui.settings.UpdatePrompt
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import io.github.voidqubex.wifi_fan.ui.theme.GlowTheme

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
class MainActivity : ComponentActivity() {
    private lateinit var bleManager: BleManager
    private lateinit var otaManager: OtaManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bleManager = (application as GlowApp).bleManager
        SyncHub.uiAlive = true
        if (savedInstanceState == null) UpdatePrompt.newLaunch()
        otaManager = OtaManager(bleManager, lifecycleScope)
        val settingsStore = SettingsStore(this)
        AppLook.monoFont = settingsStore.monoFont
        AppLook.cornerScale = settingsStore.cornerScale
        AppLook.roundLedPreview = settingsStore.roundLedPreview
        AppLook.pureBlack = settingsStore.pureBlack
        // the glass shader needs Android 13
        AppLook.refractiveGlass = settingsStore.refractiveGlass && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        AppLook.haptics = settingsStore.haptics
        AppLook.hapticStrength = settingsStore.hapticStrength
        AppLook.imageDim = settingsStore.imageDim
        WindowCompat.setDecorFitsSystemWindows(window, false)
        enableEdgeToEdge()
        setContent {
            var colorScheme by remember { mutableStateOf(settingsStore.colorScheme) }
            var accentColor by remember { mutableIntStateOf(settingsStore.accentColor) }
            var background by remember { mutableStateOf(settingsStore.background) }
            var rainbowSync by remember { mutableStateOf(settingsStore.rainbowSync) }

            GlowTheme(
                colored = colorScheme == AppColorScheme.COLORED,
                pureMono = colorScheme == AppColorScheme.MONOCHROME,
                accent = Color(accentColor)
            ) {
                Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                    BleControlScreen(
                        bleManager = bleManager,
                        otaManager         = otaManager,
                        colorScheme = colorScheme,
                        accentColor = accentColor,
                        background = background,
                        rainbowSync = rainbowSync,
                        onRainbowSyncChange = { rainbowSync = it; settingsStore.rainbowSync = it },
                        onColorChange = { colorScheme = it; settingsStore.colorScheme = it },
                        onAccentChange = { accentColor = it; settingsStore.accentColor = it },
                        onBackgroundChange = { background = it; settingsStore.background = it })
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        SyncHub.uiAlive = false
        // Leaving for good ends the Bluetooth link (a rotation doesn't), unless Music, Visualizer,
        // Screen sync or Auto light still drives the LED: that service lets go of it when it stops.
        if (isFinishing && !SyncHub.isActive() && !AutoLight.running) bleManager.disconnect()
    }
}

class Commands {
    companion object {
        const val LED: String = "l="           // l=R/G/B (0-255), older firmware
        const val LED_HSV: String = "h="       // h=H/S/V: hue 0-359, sat/brightness 0-100 (firmware 1.1.0+)
        const val CANDLE: String = "candle"   // candle=V: flickering candle flame (firmware 1.2.0+)
        const val RAINBOW: String = "rain"     // rain=S/V: start rainbow / adjust its sat/brightness
    }
}

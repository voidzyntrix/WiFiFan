package io.github.voidqubex.wifi_fan.ui.settings

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.AppBackground
import io.github.voidqubex.wifi_fan.AppColorScheme
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.ota.AppUpdateState
import io.github.voidqubex.wifi_fan.ota.AppUpdater
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ota.OtaState
import io.github.voidqubex.wifi_fan.ui.components.CircleIconButton
import io.github.voidqubex.wifi_fan.ui.components.FitText
import io.github.voidqubex.wifi_fan.ui.components.GradientBar
import io.github.voidqubex.wifi_fan.ui.components.SegmentedPill
import io.github.voidqubex.wifi_fan.ui.components.bounceClickable
import io.github.voidqubex.wifi_fan.ui.components.entrance
import io.github.voidqubex.wifi_fan.ui.components.screenPadding
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import io.github.voidqubex.wifi_fan.ui.theme.CornerScales
import io.github.voidqubex.wifi_fan.ui.theme.activeFill
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.onActiveFill
import io.github.voidqubex.wifi_fan.ui.theme.rounded
import kotlin.math.roundToInt

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

@Composable
internal fun SettingsScreen(
    colorScheme: AppColorScheme,
    accentColor: Int,
    background: AppBackground,
    rainbowSync: Boolean,
    onRainbowSyncChange: (Boolean) -> Unit,
    smoothCandle: Boolean,
    onSmoothCandleChange: (Boolean) -> Unit,
    rainbowSeconds: Int,
    onRainbowSecondsChange: (Int) -> Unit,
    fadeMs: Int,
    onFadeMsChange: (Int) -> Unit,
    candleHue: Int,
    onCandleHueChange: (Int) -> Unit,
    keepScreenOn: Boolean,
    onKeepScreenOnChange: (Boolean) -> Unit,
    updateToasts: Boolean,
    onUpdateToastsChange: (Boolean) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    otaManager: OtaManager,
    boardVersion: String?,
    isConnected: Boolean,
    onBack: () -> Unit,
    onWhatsNew: () -> Unit = {}
) {
    val otaState by otaManager.state.collectAsState()
    val settingsContext = LocalContext.current
    val store = remember { SettingsStore(settingsContext) }
    var boardOpen by remember { mutableStateOf(!store.categoryCollapsed("board")) }
    var uiOpen by remember { mutableStateOf(!store.categoryCollapsed("ui")) }
    var firmwareOpen by remember { mutableStateOf(!store.categoryCollapsed("firmware")) }
    var cornerStyle by remember { mutableIntStateOf(store.cornerStyle) }
    var customCorner by remember { mutableFloatStateOf(store.customCorner) }
    val onBg = MaterialTheme.colorScheme.onBackground

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = screenPadding(), vertical = 12.dp)
    ) {
        // ── Header ──
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.entrance(0)) {
            CircleIconButton(R.drawable.arrow_back, "Back") { if (!otaState.busy) onBack() }
            Spacer(Modifier.width(12.dp))
            Text(
                "Settings",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = onBg
            )
        }
        Spacer(Modifier.height(16.dp))

        // ── Board LED ──
        SettingsCard("Board LED", boardOpen, Modifier.entrance(1), {
            boardOpen = !boardOpen; store.setCategoryCollapsed("board", !boardOpen)
        }) {
            SettingSwitch(
                "Smooth candle", "Slow, gentle flicker (easier on the eyes at night)",
                smoothCandle, onSmoothCandleChange
            )
            SettingGap()
            val candleHues = listOf(10, 19, 30)
            SettingHeading("Candle colour", "Tint of the candle flame")
            SegmentedPill(listOf("Ember", "Warm", "Amber"), candleHues.indexOf(candleHue)) {
                onCandleHueChange(candleHues[it])
            }
            SettingGap()
            val rainbowSpeeds = listOf(30, 15, 6)
            SettingHeading("Rainbow speed", "One trip round the colour wheel: 30, 15 or 6 s")
            SegmentedPill(listOf("Slow", "Normal", "Fast"), rainbowSpeeds.indexOf(rainbowSeconds)) {
                onRainbowSecondsChange(rainbowSpeeds[it])
            }
            SettingGap()
            val fades = listOf(500, 1500, 3000)
            SettingHeading("Colour fade", "Time to reach a new colour: 0.5, 1.5 or 3 s")
            SegmentedPill(listOf("Quick", "Normal", "Slow"), fades.indexOf(fadeMs)) {
                onFadeMsChange(fades[it])
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Candle options, rainbow speed and fade need board firmware 1.3.0 or newer.",
                style = MaterialTheme.typography.bodySmall,
                color = onBg.copy(alpha = 0.45f)
            )
        }

        Spacer(Modifier.height(12.dp))

        // ── App UI ──
        SettingsCard("App UI", uiOpen, Modifier.entrance(2), {
            uiOpen = !uiOpen; store.setCategoryCollapsed("ui", !uiOpen)
        }) {
            SettingHeading("Background", "What appears behind the controls")
            SegmentedPill(
                listOf("Particles", "Image"),
                if (background == AppBackground.IMAGE) 1 else 0
            ) { onBackgroundChange(if (it == 1) AppBackground.IMAGE else AppBackground.SIMPLE) }
            SettingGap()
            SettingHeading("Colour", "Pure grayscale, grayscale with accents, or fully coloured")
            SegmentedPill(listOf("Monochrome", "Tinted", "Coloured"), colorScheme.ordinal) {
                onColorChange(AppColorScheme.entries[it])
            }
            androidx.compose.animation.AnimatedVisibility(
                visible = colorScheme == AppColorScheme.COLORED,
                enter = fadeIn(tween(200)) + androidx.compose.animation.expandVertically(tween(280)),
                exit = fadeOut(tween(150)) + androidx.compose.animation.shrinkVertically(tween(240))
            ) {
                Column {
                    Spacer(Modifier.height(18.dp))
                    AccentColorPicker(selected = accentColor, onPick = onAccentChange)
                }
            }
            SettingGap()
            SettingHeading("Font", "Used for all text in the app")
            SegmentedPill(listOf("System", "JetBrains Mono"), if (AppLook.monoFont) 1 else 0) {
                AppLook.monoFont = it == 1
                store.monoFont = it == 1
            }
            SettingGap()
            SettingHeading("Corners", "Roundness of everything: cards, buttons, pills, dots, thumbs")
            SegmentedPill(listOf("Square", "Small", "Medium", "Large", "Custom"), cornerStyle) {
                cornerStyle = it
                store.cornerStyle = it
                AppLook.cornerScale = if (it == 4) customCorner else CornerScales[it]
            }
            androidx.compose.animation.AnimatedVisibility(
                visible = cornerStyle == 4,
                enter = fadeIn(tween(200)) + androidx.compose.animation.expandVertically(tween(280)),
                exit = fadeOut(tween(150)) + androidx.compose.animation.shrinkVertically(tween(240))
            ) {
                Column {
                    Spacer(Modifier.height(14.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Radius",
                            style = MaterialTheme.typography.labelMedium,
                            color = onBg.copy(alpha = 0.6f),
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            "${(customCorner * 100).roundToInt()} %",
                            style = MaterialTheme.typography.labelLarge,
                            color = onBg
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    GradientBar(
                        fraction = customCorner / 2f,
                        stops = listOf(onBg.copy(alpha = 0.12f), onBg.copy(alpha = 0.55f)),
                        thumbColor = MaterialTheme.colorScheme.primary,
                        onFraction = {
                            customCorner = it * 2f
                            AppLook.cornerScale = customCorner
                        },
                        onFinished = { store.customCorner = customCorner }
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "0 % is square, 100 % makes round things fully round, above that cards get rounder.",
                        style = MaterialTheme.typography.bodySmall,
                        color = onBg.copy(alpha = 0.5f)
                    )
                }
            }
            SettingGap()
            SettingSwitch(
                "Round LED preview", "Keep the LED preview a perfect circle whatever the corners",
                AppLook.roundLedPreview
            ) { AppLook.roundLedPreview = it; store.roundLedPreview = it }
            SwitchGap()
            SettingSwitch(
                "Pure black (OLED)", "Black background in dark mode",
                AppLook.pureBlack
            ) { AppLook.pureBlack = it; store.pureBlack = it }
            SwitchGap()
            SettingSwitch(
                "Rainbow preview", "Animate the colour sliders while Rainbow runs",
                rainbowSync, onRainbowSyncChange
            )
            SwitchGap()
            SettingSwitch(
                "Haptics", "Light ticks on sliders and taps on buttons",
                AppLook.haptics
            ) { AppLook.haptics = it; store.haptics = it }
            SwitchGap()
            SettingSwitch("Keep screen on", null, keepScreenOn, onKeepScreenOnChange)
            SwitchGap()
            SettingSwitch(
                "Update notifications", "Toast at launch when an update is available",
                updateToasts, onUpdateToastsChange
            )
        }

        Spacer(Modifier.height(12.dp))

        // ── Firmware & updates ──
        SettingsCard("Firmware & updates", firmwareOpen, Modifier.entrance(3), {
            firmwareOpen = !firmwareOpen; store.setCategoryCollapsed("firmware", !firmwareOpen)
        }) {
            FirmwareSection(
                otaManager   = otaManager,
                state        = otaState,
                boardVersion = boardVersion,
                isConnected  = isConnected
            )
            Spacer(Modifier.height(12.dp))
            AppUpdateSection()
            Spacer(Modifier.height(12.dp))
            PillButton("What's new", highlighted = false, onClick = onWhatsNew)
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun FirmwareSection(
    otaManager: OtaManager,
    state: OtaState,
    boardVersion: String?,
    isConnected: Boolean
) {
    // During an update: keep the screen on and don't let Back close the app,
    // either would cut the Bluetooth link halfway.
    val view = LocalView.current
    DisposableEffect(state.busy) {
        view.keepScreenOn = state.busy
        onDispose { view.keepScreenOn = false }
    }
    BackHandler(enabled = state.busy) { }

    UpdateBlock(
        title = when {
            !isConnected         -> "Board not connected"
            boardVersion != null -> "Board firmware v$boardVersion"
            else                 -> "Board firmware version unknown"
        },
        status = otaStatusText(state),
        error = state is OtaState.Error
    ) {
        if (state.busy || state == OtaState.Checking) {
            UpdateProgress(
                if (state is OtaState.Uploading && state.total > 0) state.sent.toFloat() / state.total else null
            )
        } else if (state is OtaState.UpdateAvailable) {
            PillButton("Update to v${state.release.version}", highlighted = true, enabled = isConnected) {
                otaManager.startUpdate(state.release)
            }
        } else {
            PillButton("Check for updates", highlighted = false, enabled = isConnected) {
                otaManager.checkForUpdate(boardVersion)
            }
        }
    }
}

@Composable
private fun AppUpdateSection() {
    val context = LocalContext.current
    val state = AppUpdater.state.collectAsState().value
    val installedVersion = remember { AppUpdater.installedVersion(context) }

    LaunchedEffect(Unit) {
        if (AppUpdater.state.value == AppUpdateState.Idle) AppUpdater.checkForUpdate(context)
    }
    // Android's "Update this app?" prompt; started here so it only opens while the app is visible.
    LaunchedEffect(state) {
        (state as? AppUpdateState.WaitingForUser)?.let {
            context.startActivity(it.confirm)
            AppUpdater.confirmShown()
        }
    }
    val allowInstalls = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { AppUpdater.continueInstall(context) }

    UpdateBlock(
        title = "Glow v$installedVersion",
        status = appUpdateStatusText(state),
        error = state is AppUpdateState.Error
    ) {
        when {
            state is AppUpdateState.Downloading && state.total > 0 ->
                UpdateProgress(state.read.toFloat() / state.total)
            state.busy || state == AppUpdateState.Checking -> UpdateProgress(null)
            state is AppUpdateState.UpdateAvailable ->
                PillButton("Update to v${state.release.version}", highlighted = true) {
                    AppUpdater.startUpdate(context, state.release)
                }
            state == AppUpdateState.NeedsPermission ->
                PillButton("Allow app updates", highlighted = true) {
                    allowInstalls.launch(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${context.packageName}")
                        )
                    )
                }
            else -> PillButton("Check for updates", highlighted = false) {
                AppUpdater.checkForUpdate(context)
            }
        }
    }
}

/** One update target (board or app): name, status line, then a button or progress bar. */
@Composable
private fun UpdateBlock(
    title: String,
    status: String,
    error: Boolean,
    action: @Composable ColumnScope.() -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(rounded(18.dp))
            .background(onBg.copy(alpha = 0.05f))
            .padding(16.dp)
    ) {
        Text(
            text       = title,
            style      = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color      = onBg
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text  = status,
            style = MaterialTheme.typography.bodySmall,
            color = if (error) MaterialTheme.colorScheme.error else onBg.copy(alpha = 0.6f)
        )
        Spacer(Modifier.height(12.dp))
        action()
    }
}

/** Progress bar: [fraction] 0..1, or null while the length isn't known. */
@Composable
private fun UpdateProgress(fraction: Float?) {
    val track = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f)
    val mod = Modifier
        .fillMaxWidth()
        .height(6.dp)
        .clip(circle())
    // Square caps and no stop dot: the clip gives the bar the app's corner shape.
    if (fraction != null) {
        val shown by animateFloatAsState(fraction, tween(300), label = "updateProgress")
        LinearProgressIndicator(
            progress = { shown }, modifier = mod, trackColor = track,
            strokeCap = StrokeCap.Butt, gapSize = 0.dp, drawStopIndicator = {}
        )
    } else {
        LinearProgressIndicator(
            modifier = mod, trackColor = track, strokeCap = StrokeCap.Butt, gapSize = 0.dp
        )
    }
}

/** Full-width button in the app's style; [highlighted] fills it with the accent colour. */
@Composable
internal fun PillButton(
    text: String,
    highlighted: Boolean,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val bg by animateColorAsState(
        if (highlighted) activeFill(strong = true) else onBg.copy(alpha = 0.08f),
        tween(250), label = "pillButtonBg"
    )
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(rounded(16.dp))
            .background(bg)
            .alpha(if (enabled) 1f else 0.4f)
            .bounceClickable(enabled = enabled, pressedScale = 0.97f, onClick = onClick)
    ) {
        FitText(
            text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (highlighted) onActiveFill() else onBg,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
    }
}

private fun appUpdateStatusText(state: AppUpdateState): String = when (state) {
    AppUpdateState.Idle               -> "New versions are published as GitHub releases."
    AppUpdateState.Checking           -> "Checking GitHub…"
    is AppUpdateState.UpToDate        -> "Up to date (latest release is v${state.latest})."
    is AppUpdateState.UpdateAvailable -> "Version ${state.release.version} is available."
    is AppUpdateState.Downloading     ->
        if (state.total > 0) "Downloading… ${state.read * 100 / state.total} %" else "Downloading…"
    AppUpdateState.NeedsPermission    ->
        "Downloaded. Allow Glow to install apps, then come back here to finish."
    AppUpdateState.Installing         -> "Installing… the app closes when it's done; open it again."
    is AppUpdateState.WaitingForUser  -> "Confirm the update in Android's prompt."
    is AppUpdateState.Error           -> state.message
}

private fun otaStatusText(state: OtaState): String = when (state) {
    OtaState.Idle               -> "New firmware is published as GitHub releases."
    OtaState.Checking           -> "Checking GitHub…"
    is OtaState.UpToDate        -> "Up to date (latest release is v${state.latest})."
    is OtaState.UpdateAvailable -> "Version ${state.release.version} is available."
    OtaState.Downloading        -> "Downloading…"
    OtaState.EnteringBootloader -> "Restarting the board into update mode…"
    is OtaState.Uploading       ->
        "Sending… ${state.sent * 100 / state.total.coerceAtLeast(1)} % — keep the app open"
    OtaState.Verifying          -> "Checking the new firmware…"
    is OtaState.Done            -> "Updated to v${state.version}."
    is OtaState.Error           -> state.message
}

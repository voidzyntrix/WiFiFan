package io.github.voidqubex.wifi_fan.ui.home

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothProfile
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import io.github.voidqubex.wifi_fan.audio.AudioSyncService
import io.github.voidqubex.wifi_fan.screen.ScreenSyncService
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.sync.SyncKind
import io.github.voidqubex.wifi_fan.sync.SyncParams
import io.github.voidqubex.wifi_fan.ui.whatsnew.WhatsNewDialog
import kotlinx.coroutines.CancellationException
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.github.voidqubex.wifi_fan.AppBackground
import io.github.voidqubex.wifi_fan.AppColorScheme
import io.github.voidqubex.wifi_fan.Commands
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.led.LedColor
import io.github.voidqubex.wifi_fan.led.LedPreview
import io.github.voidqubex.wifi_fan.ota.AppUpdateState
import io.github.voidqubex.wifi_fan.ota.AppUpdater
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ota.OtaState
import io.github.voidqubex.wifi_fan.ui.components.AmbientParticleBackground
import io.github.voidqubex.wifi_fan.ui.components.CircleIconButton
import io.github.voidqubex.wifi_fan.ui.components.GradientBar
import io.github.voidqubex.wifi_fan.ui.components.LocalBlurLayer
import io.github.voidqubex.wifi_fan.ui.components.PanelCard
import io.github.voidqubex.wifi_fan.ui.components.PresetDot
import io.github.voidqubex.wifi_fan.ui.components.SegmentedPill
import io.github.voidqubex.wifi_fan.ui.components.SliderLabel
import io.github.voidqubex.wifi_fan.ui.components.bounceClickable
import io.github.voidqubex.wifi_fan.ui.components.entrance
import io.github.voidqubex.wifi_fan.ui.components.isCompact
import io.github.voidqubex.wifi_fan.ui.components.screenPadding
import io.github.voidqubex.wifi_fan.ui.connect.ConnectScreen
import io.github.voidqubex.wifi_fan.ui.connect.StatusPill
import io.github.voidqubex.wifi_fan.ui.settings.SettingsScreen
import io.github.voidqubex.wifi_fan.ui.theme.activeFill
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.onActiveFill
import io.github.voidqubex.wifi_fan.ui.theme.rounded
import kotlin.math.roundToInt
import kotlin.math.sin

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

@SuppressLint("ObsoleteSdkInt", "MissingPermission", "UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun BleControlScreen(
    bleManager: BleManager,
    otaManager: OtaManager,
    colorScheme: AppColorScheme,
    accentColor: Int,
    background: AppBackground,
    rainbowSync: Boolean,
    onRainbowSyncChange: (Boolean) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val isDark = isSystemInDarkTheme()
    val mono = colorScheme == AppColorScheme.TINTED

    SideEffect {
        (context as? Activity)?.window?.let { window ->
            WindowInsetsControllerCompat(window, window.decorView).apply {
                isAppearanceLightStatusBars = !isDark
                isAppearanceLightNavigationBars = !isDark
            }
        }
    }

    var showSettings by remember { mutableStateOf(false) }
    // Back gesture closes Settings instead of leaving the app.
    BackHandler(enabled = showSettings) { showSettings = false }
    var pickingDevice by remember { mutableStateOf(false) }

    // LED state survives closing the app (the board keeps it too).
    val ledStore = remember { SettingsStore(context) }
    var ledColor by remember { mutableIntStateOf(ledStore.ledColor) }
    var ledBri by remember { mutableFloatStateOf(ledStore.ledBrightness) }
    var ledMode by remember { mutableIntStateOf(ledStore.ledMode) }
    var ledKelvinMode by remember { mutableStateOf(ledStore.ledKelvinMode) }
    var ledKelvin by remember { mutableFloatStateOf(ledStore.ledKelvin) }
    LaunchedEffect(ledColor, ledBri, ledMode, ledKelvinMode, ledKelvin) {
        ledStore.ledColor = ledColor
        ledStore.ledBrightness = ledBri
        ledStore.ledMode = ledMode
        ledStore.ledKelvinMode = ledKelvinMode
        ledStore.ledKelvin = ledKelvin
    }

    val connectionState by bleManager.connectionState.collectAsState()
    val foundDevices    by bleManager.foundDevices.collectAsState()
    val isScanning      by bleManager.isScanning.collectAsState()
    val boardVersion    by bleManager.firmwareVersion.collectAsState()

    val isConnected = connectionState == BluetoothProfile.STATE_CONNECTED

    // LED options from Settings (board firmware 1.3.0+ understands them)
    var smoothCandle by remember { mutableStateOf(ledStore.smoothCandle) }
    var rainbowSeconds by remember { mutableIntStateOf(ledStore.rainbowSeconds) }
    var fadeMs by remember { mutableIntStateOf(ledStore.fadeMs) }
    var candleHue by remember { mutableIntStateOf(ledStore.candleHue) }
    var keepScreenOn by remember { mutableStateOf(ledStore.keepScreenOn) }
    var updateToasts by remember { mutableStateOf(ledStore.updateToasts) }
    val rootView = LocalView.current
    DisposableEffect(keepScreenOn) {
        rootView.keepScreenOn = keepScreenOn
        onDispose { rootView.keepScreenOn = false }
    }
    fun fwAtLeast(v: String) = boardVersion?.let { GitHubReleases.compareVersions(it, v) >= 0 } ?: false
    val fwOptions = fwAtLeast("1.3.0")
    // Hue picked in the colour controls while Candle runs (null = the Settings candle colour).
    var candleHueOverride by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(candleHue) { candleHueOverride = null }
    fun candleCommand(bri: Float) = Commands.CANDLE + "=${(bri * 100).roundToInt()}" +
        if (fwOptions) "/${if (smoothCandle) 1 else 0}/${candleHueOverride ?: candleHue}" else ""
    fun rainbowCommand(sat: Float, bri: Float) =
        Commands.RAINBOW + "=${(sat * 100).roundToInt()}/${(bri * 100).roundToInt()}" +
            if (fwOptions) "/$rainbowSeconds" else ""
    // Fade time: sent when the board connects and whenever it's changed.
    LaunchedEffect(fwOptions, isConnected, fadeMs) {
        if (fwOptions && isConnected) bleManager.sendData("fade=$fadeMs")
    }
    // Changing candle/rainbow options while that mode runs applies them right away.
    LaunchedEffect(smoothCandle, rainbowSeconds, candleHue) {
        if (!fwOptions || !isConnected) return@LaunchedEffect
        val hsv = FloatArray(3).also { AndroidColor.colorToHSV(ledColor, it) }
        when (ledMode) {
            LED_MODE_CANDLE -> bleManager.sendData(candleCommand(ledBri))
            LED_MODE_RAINBOW -> bleManager.sendData(rainbowCommand(hsv[1], ledBri))
        }
    }

    // Both update checks run at launch; a toast says when something is available.
    LaunchedEffect(Unit) {
        if (AppUpdater.state.value == AppUpdateState.Idle) AppUpdater.checkForUpdate(context)
    }
    val appUpdateState by AppUpdater.state.collectAsState()
    val fwUpdateState by otaManager.state.collectAsState()
    LaunchedEffect(isConnected, boardVersion) {
        val st = otaManager.state.value
        if (isConnected && boardVersion != null &&
            (st == OtaState.Idle || st is OtaState.Error || st is OtaState.Done || st is OtaState.UpToDate)
        ) otaManager.checkForUpdate(boardVersion)
    }
    LaunchedEffect(appUpdateState is AppUpdateState.UpdateAvailable) {
        if (updateToasts) (appUpdateState as? AppUpdateState.UpdateAvailable)?.let {
            Toast.makeText(context, "App update v${it.release.version} available in Settings", Toast.LENGTH_LONG).show()
        }
    }
    LaunchedEffect(fwUpdateState is OtaState.UpdateAvailable) {
        if (updateToasts) (fwUpdateState as? OtaState.UpdateAvailable)?.let {
            Toast.makeText(context, "Board firmware v${it.release.version} available in Settings", Toast.LENGTH_LONG).show()
        }
    }

    // "What's new" once after an update (a fresh install only remembers its version).
    var whatsNewOpen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val installed = AppUpdater.installedVersion(context)
        val seen = ledStore.lastSeenVersion
        if (seen != null && GitHubReleases.compareVersions(installed, seen) > 0) whatsNewOpen = true
        if (seen == null || GitHubReleases.compareVersions(installed, seen) > 0) ledStore.lastSeenVersion = installed
    }
    if (whatsNewOpen) WhatsNewDialog(onDismiss = { whatsNewOpen = false })

    val permissionsToRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        if (!perms.values.all { it }) {
            Toast.makeText(context, "Permissions required for Bluetooth", Toast.LENGTH_SHORT).show()
        }
    }
    fun checkPermissionsAndDo(action: () -> Unit) {
        if (permissionsToRequest.all {
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
            }) action() else launcher.launch(permissionsToRequest)
    }

    // -----------------------------------------------------------------------
    // LED controls state
    // -----------------------------------------------------------------------
    val initHsv = remember { FloatArray(3).also { AndroidColor.colorToHSV(ledColor, it) } }
    val kelvinHs = LedColor.kelvinToHueSat(ledKelvin)
    var hue by remember { mutableFloatStateOf(if (ledKelvinMode) kelvinHs[0] else initHsv[0]) }
    var sat by remember { mutableFloatStateOf(if (ledKelvinMode) kelvinHs[1] else initHsv[1]) }
    // exact brightness (the RGB colour loses precision when dim)
    var bri by remember { mutableFloatStateOf(ledBri) }
    LaunchedEffect(bri) { ledBri = bri }
    // what the power button brings back after "off"
    var lastOnBri by remember { mutableFloatStateOf(if (ledBri >= MIN_VISIBLE_BRIGHTNESS) ledBri else 1f) }
    var lastOnMode by remember { mutableIntStateOf(ledMode) }
    var lastSentMs by remember { mutableLongStateOf(0L) }
    var musicSensitivity by remember { mutableFloatStateOf(ledStore.musicSensitivity) }
    var musicKeepColour by remember { mutableStateOf(ledStore.musicKeepColour) }

    // Clock for the preview animations (one hue lap every 4 s).
    val rainbowHue by rememberInfiniteTransition(label = "rainbow").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(4000, easing = LinearEasing)),
        label = "rainbowHue"
    )
    val cycling = ledMode == LED_MODE_RAINBOW && rainbowSync
    val shownHue = if (cycling) rainbowHue else hue

    // Board firmware 1.1.0+ takes colours as HSV; older firmware only knows RGB
    // (and would misread h=H/S/V as an RGB colour).
    val hsvCommands = fwAtLeast("1.1.0")
    val fwCandle = fwAtLeast("1.2.0")
    val fwEffects = fwAtLeast("1.4.0")

    // A colour as h=H/S/V (hue in degrees, saturation/brightness in percent), or l=R/G/B.
    fun sendColour(h: Float, s: Float, v: Float) {
        val color = AndroidColor.HSVToColor(floatArrayOf(h, s, v))
        bleManager.sendData(
            if (hsvCommands) {
                Commands.LED_HSV +
                    "${((h.roundToInt() % 360) + 360) % 360}/${(s * 100).roundToInt()}/${(v * 100).roundToInt()}"
            } else {
                Commands.LED +
                    "${AndroidColor.red(color)}/${AndroidColor.green(color)}/${AndroidColor.blue(color)}"
            }
        )
    }

    // Solid colour.
    fun sendHsvColour() {
        sendColour(hue, sat, bri)
        ledColor = AndroidColor.HSVToColor(floatArrayOf(hue, sat, bri))
    }

    fun sendSolid() {
        sendHsvColour()
        ledMode = LED_MODE_SOLID
    }

    // Rainbow: keeps cycling on the board, only saturation/brightness change.
    fun sendRainbow() {
        bleManager.sendData(rainbowCommand(sat, bri))
        ledColor = AndroidColor.HSVToColor(floatArrayOf(hue, sat, bri))
        ledMode = LED_MODE_RAINBOW
    }

    // Picking a colour keeps the modes that use one (Breathe, Candle); anything else becomes Solid.
    fun colourPicked() {
        when (ledMode) {
            LED_MODE_BREATHE -> {}
            LED_MODE_MUSIC -> musicKeepColour = true
            LED_MODE_CANDLE -> candleHueOverride = ((hue.roundToInt() % 360) + 360) % 360
            else -> ledMode = LED_MODE_SOLID
        }
    }

    // Kelvin is just another way to pick hue/saturation: same commands as the colour picker.
    fun setKelvin(k: Float) {
        ledKelvin = k
        val hs = LedColor.kelvinToHueSat(k)
        hue = hs[0]; sat = hs[1]
        colourPicked()
    }

    // Candle: the board flickers a warm flame around this brightness.
    fun sendCandle() {
        bleManager.sendData(candleCommand(bri))
        ledMode = LED_MODE_CANDLE
    }

    // Effects run on the board; the brightness slider re-sends them at the new level.
    fun sendEffect(mode: Int) {
        val cmd = LedEffects.first { it.first == mode }.third
        bleManager.sendData("$cmd=${(bri * 100).roundToInt()}")
        ledMode = mode
    }

    fun sendCurrent() = when (ledMode) {
        LED_MODE_RAINBOW -> sendRainbow()
        LED_MODE_CANDLE -> sendCandle()
        LED_MODE_BREATHE -> { sendHsvColour(); sendEffect(LED_MODE_BREATHE) }   // breathes in the picked colour
        LED_MODE_OCEAN, LED_MODE_PARTY, LED_MODE_AURORA -> sendEffect(ledMode)
        LED_MODE_MUSIC, LED_MODE_VISUALIZER, LED_MODE_SCREEN -> {}   // their services send the colour
        else -> sendSolid()
    }

    // Live update while dragging, throttled so BLE writes aren't flooded.
    fun sendThrottled() {
        val now = System.currentTimeMillis()
        if (now - lastSentMs >= 80L) {
            lastSentMs = now
            sendCurrent()
        }
    }

    val ledOn = bri >= MIN_VISIBLE_BRIGHTNESS
    fun togglePower() {
        if (ledOn) {
            lastOnBri = bri; lastOnMode = ledMode
            bri = 0f
            sendSolid()                       // fades to black, ends any effect
        } else {
            bri = lastOnBri
            // Screen sync and Visualizer need a fresh capture consent, so they come back as Solid.
            ledMode = if (lastOnMode == LED_MODE_SCREEN || lastOnMode == LED_MODE_VISUALIZER) LED_MODE_SOLID
            else lastOnMode
            sendCurrent()
        }
    }

    // ── Music / Visualizer / Screen sync ──
    // Foreground services do the listening and capturing, so they keep driving the LED with the
    // app closed. This screen starts and stops them, and shows what they report.
    LaunchedEffect(musicKeepColour) { ledStore.musicKeepColour = musicKeepColour }
    val syncActive by SyncHub.active.collectAsState()
    val syncLevel by SyncHub.level.collectAsState()
    val syncHue by SyncHub.hue.collectAsState()
    val syncSat by SyncHub.sat.collectAsState()
    val syncError by SyncHub.error.collectAsState()
    // What the services read live.
    SideEffect {
        SyncParams.hue = hue
        SyncParams.sat = sat
        SyncParams.bri = bri
        SyncParams.sensitivity = musicSensitivity
        SyncParams.keepColour = musicKeepColour
    }
    val liveHue = if (syncActive == SyncKind.NONE) hue else syncHue
    val liveSat = if (syncActive == SyncKind.NONE) sat else syncSat
    val liveLevel = if (syncActive == SyncKind.NONE) 0f else syncLevel

    fun micGranted() = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
    fun stopSync(kind: SyncKind) {
        when (kind) {
            SyncKind.SCREEN -> ScreenSyncService.stop(context)
            SyncKind.MUSIC, SyncKind.VISUALIZER -> AudioSyncService.stop(context)
            SyncKind.NONE -> {}
        }
    }

    // What the capture consent screen was opened for (Visualizer or Screen sync).
    var pendingKind by remember { mutableStateOf(SyncKind.NONE) }
    val captureLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        val visualizer = pendingKind == SyncKind.VISUALIZER
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            if (visualizer) {
                AudioSyncService.startSpeaker(context, result.resultCode, data)
                ledMode = LED_MODE_VISUALIZER
            } else {
                ScreenSyncService.start(context, result.resultCode, data)
                ledMode = LED_MODE_SCREEN
            }
            if (ledKelvinMode) ledKelvinMode = false
        } else {
            Toast.makeText(
                context,
                if (visualizer) "The visualizer needs permission to capture the audio your phone plays."
                else "Screen sync needs permission to see the screen.",
                Toast.LENGTH_SHORT
            ).show()
        }
        pendingKind = SyncKind.NONE
    }
    // Consent first, then the foreground service starts (required on Android 14+).
    fun requestCapture() {
        val mpm = context.getSystemService(MediaProjectionManager::class.java)
        captureLauncher.launch(mpm.createScreenCaptureIntent())
    }
    val notifyLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        requestCapture()   // the Stop button lives in the notification, but it works without
    }
    fun continueToCapture() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) notifyLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        else requestCapture()
    }
    val micLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) {
            Toast.makeText(
                context, "This mode listens to audio; without the permission the LED stays as it is.",
                Toast.LENGTH_LONG
            ).show()
            pendingKind = SyncKind.NONE
        } else if (pendingKind == SyncKind.VISUALIZER) {
            continueToCapture()
        } else {
            ledMode = LED_MODE_MUSIC
            pendingKind = SyncKind.NONE
        }
    }

    // Start a mode from the mode menu.
    fun startMode(mode: Int) {
        if (bri < MIN_VISIBLE_BRIGHTNESS) bri = lastOnBri
        when (mode) {
            LED_MODE_SOLID -> sendSolid()
            LED_MODE_RAINBOW -> {
                if (ledKelvinMode) { ledKelvinMode = false; sat = 1f }
                if (sat < 0.05f) sat = 1f
                sendRainbow()
            }
            LED_MODE_CANDLE -> sendCandle()
            LED_MODE_MUSIC -> {
                pendingKind = SyncKind.MUSIC
                if (micGranted()) { ledMode = LED_MODE_MUSIC; pendingKind = SyncKind.NONE }
                else micLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            LED_MODE_VISUALIZER -> if (ledMode != LED_MODE_VISUALIZER) {
                pendingKind = SyncKind.VISUALIZER
                if (micGranted()) continueToCapture() else micLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            LED_MODE_SCREEN -> if (ledMode != LED_MODE_SCREEN) {
                pendingKind = SyncKind.SCREEN
                continueToCapture()
            }
            else -> { if (ledKelvinMode) ledKelvinMode = false; sendEffect(mode) }
        }
    }

    // Music starts once it is wanted. The app is visible here, which Android requires to open the
    // microphone. Starting it while Visualizer runs restarts the service as Music.
    val musicWanted = ledMode == LED_MODE_MUSIC && isConnected && ledOn && micGranted()
    LaunchedEffect(musicWanted, syncActive) {
        if (musicWanted && syncActive != SyncKind.MUSIC) AudioSyncService.startMic(context)
    }
    // Stop what runs for a mode that is no longer shown, or while the LED is off. (Music and
    // Visualizer share one service, which restarts instead when the other one is picked.)
    LaunchedEffect(syncActive, ledMode, ledOn) {
        val wanted = if (!ledOn) SyncKind.NONE else when (ledMode) {
            LED_MODE_MUSIC -> SyncKind.MUSIC
            LED_MODE_VISUALIZER -> SyncKind.VISUALIZER
            LED_MODE_SCREEN -> SyncKind.SCREEN
            else -> SyncKind.NONE
        }
        fun sameService(a: SyncKind, b: SyncKind) = a != SyncKind.SCREEN && b != SyncKind.SCREEN
        if (syncActive != SyncKind.NONE && (wanted == SyncKind.NONE || !sameService(syncActive, wanted))) {
            stopSync(syncActive)
        }
    }
    // A sync that ended by itself (notification Stop, disconnect): back to the picked colour.
    var prevSync by remember { mutableStateOf(SyncKind.NONE) }
    LaunchedEffect(syncActive) {
        val was = prevSync
        prevSync = syncActive
        val mine = when (was) {
            SyncKind.MUSIC -> LED_MODE_MUSIC
            SyncKind.VISUALIZER -> LED_MODE_VISUALIZER
            SyncKind.SCREEN -> LED_MODE_SCREEN
            SyncKind.NONE -> -1
        }
        if (was != SyncKind.NONE && syncActive == SyncKind.NONE && ledMode == mine) {
            ledMode = LED_MODE_SOLID
            sendCurrent()
        }
    }
    LaunchedEffect(syncError) {
        val message = syncError ?: return@LaunchedEffect
        SyncHub.error.value = null
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        if (ledMode == LED_MODE_MUSIC || ledMode == LED_MODE_VISUALIZER || ledMode == LED_MODE_SCREEN) {
            ledMode = LED_MODE_SOLID
            sendCurrent()
        }
    }
    // Disconnected, or restored from a previous run without a capture: Visualizer and Screen fall
    // back to Solid (they need a fresh capture consent).
    LaunchedEffect(isConnected) {
        val needsCapture = ledMode == LED_MODE_SCREEN || ledMode == LED_MODE_VISUALIZER
        if (needsCapture && (!isConnected || SyncHub.active.value == SyncKind.NONE)) ledMode = LED_MODE_SOLID
    }

    // What the preview shows: the board's mode, approximated.
    val previewHue = when (ledMode) {
        LED_MODE_RAINBOW, LED_MODE_PARTY -> rainbowHue
        LED_MODE_CANDLE -> candleHue.toFloat()
        LED_MODE_MUSIC, LED_MODE_VISUALIZER, LED_MODE_SCREEN -> liveHue
        LED_MODE_OCEAN -> 205f + 20f * sin(rainbowHue / 360f * 6.2832f)
        LED_MODE_AURORA -> 200f + 80f * sin(rainbowHue / 360f * 6.2832f / 4f)
        else -> hue
    }
    val previewSat = when (ledMode) {
        LED_MODE_CANDLE -> 0.94f
        LED_MODE_OCEAN -> 0.9f
        LED_MODE_AURORA -> 0.82f
        LED_MODE_PARTY -> 1f
        LED_MODE_MUSIC, LED_MODE_VISUALIZER, LED_MODE_SCREEN -> liveSat
        else -> sat
    }
    val previewVal = when (ledMode) {
        LED_MODE_CANDLE -> bri * (0.82f + 0.1f * sin(rainbowHue / 360f * 6.2832f * 2f))
        LED_MODE_BREATHE -> bri * (0.575f + 0.425f * sin(rainbowHue / 360f * 6.2832f))
        LED_MODE_MUSIC, LED_MODE_VISUALIZER -> bri * (0.15f + 0.85f * liveLevel)
        else -> bri
    }
    val modeName = when (ledMode) {
        LED_MODE_RAINBOW -> "Rainbow"
        LED_MODE_CANDLE -> "Candle"
        LED_MODE_MUSIC -> "Music"
        LED_MODE_VISUALIZER -> "Visualizer"
        LED_MODE_SCREEN -> "Screen sync"
        LED_MODE_SOLID -> if (ledKelvinMode) "${(ledKelvin / 50).roundToInt() * 50} K" else
            AndroidColor.HSVToColor(floatArrayOf(shownHue, sat, 1f)).let {
                "#%02X%02X%02X".format(AndroidColor.red(it), AndroidColor.green(it), AndroidColor.blue(it))
            }
        else -> LedEffects.firstOrNull { it.first == ledMode }?.second ?: ""
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    // The backdrop is recorded into a layer so the cards can draw a blurred copy of it.
    val backdropLayer = rememberGraphicsLayer()
    val blurLayer = rememberGraphicsLayer()
    SideEffect { blurLayer.renderEffect = BlurEffect(60f, 60f, TileMode.Clamp) }

    Scaffold { _ ->
        CompositionLocalProvider(LocalBlurLayer provides blurLayer) {
        Box(modifier = modifier.fillMaxSize()) {

            // ── Backdrop ────────────────────────────────────────────────
            Box(
                Modifier.fillMaxSize().drawWithContent {
                    backdropLayer.record { this@drawWithContent.drawContent() }
                    blurLayer.record { drawLayer(backdropLayer) }
                    drawLayer(backdropLayer)
                }
            ) {
            when (background) {
                AppBackground.IMAGE -> Image(
                    painter = painterResource(R.drawable.background),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                AppBackground.SIMPLE -> AmbientParticleBackground(
                    modifier = Modifier.fillMaxSize(),
                    active = isConnected && ledOn,
                    tint = MaterialTheme.colorScheme.onBackground
                )
            }
            if (background == AppBackground.IMAGE) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.35f))
                )
            }

            }

            // Settings page slides in over the control screen
            AnimatedContent(
                targetState = showSettings,
                transitionSpec = { fadeIn(tween(300)).togetherWith(fadeOut(tween(300))) },
                label = "settingsTransition",
                modifier = Modifier.fillMaxSize()
            ) { inSettings ->
                if (inSettings) {
                    SettingsScreen(
                        colorScheme = colorScheme,
                        accentColor = accentColor,
                        background = background,
                        rainbowSync = rainbowSync,
                        onRainbowSyncChange = onRainbowSyncChange,
                        smoothCandle = smoothCandle,
                        onSmoothCandleChange = { smoothCandle = it; ledStore.smoothCandle = it },
                        rainbowSeconds = rainbowSeconds,
                        onRainbowSecondsChange = { rainbowSeconds = it; ledStore.rainbowSeconds = it },
                        fadeMs = fadeMs,
                        onFadeMsChange = { fadeMs = it; ledStore.fadeMs = it },
                        candleHue = candleHue,
                        onCandleHueChange = { candleHue = it; ledStore.candleHue = it },
                        keepScreenOn = keepScreenOn,
                        onKeepScreenOnChange = { keepScreenOn = it; ledStore.keepScreenOn = it },
                        updateToasts = updateToasts,
                        onUpdateToastsChange = { updateToasts = it; ledStore.updateToasts = it },
                        onColorChange = onColorChange,
                        onAccentChange = onAccentChange,
                        onBackgroundChange = onBackgroundChange,
                        otaManager = otaManager,
                        boardVersion = boardVersion,
                        isConnected = isConnected,
                        onBack = { showSettings = false },
                        onWhatsNew = { whatsNewOpen = true })
                } else {
                    AnimatedContent(
                        targetState = isConnected,
                        transitionSpec = { fadeIn(tween(450)).togetherWith(fadeOut(tween(450))) },
                        label = "connectionTransition",
                        modifier = Modifier.fillMaxSize()
                    ) { connected ->
                        if (connected) {
                            val onBg = MaterialTheme.colorScheme.onBackground
                            val modeList = listOf(
                                Triple(LED_MODE_SOLID, "Solid", true),
                                Triple(LED_MODE_RAINBOW, "Rainbow", true),
                                Triple(LED_MODE_CANDLE, "Candle", fwCandle)
                            ) + LedEffects.map { Triple(it.first, it.second, fwEffects) } + listOf(
                                Triple(LED_MODE_MUSIC, "Music", true),
                                Triple(LED_MODE_VISUALIZER, "Visualizer", true),
                                Triple(LED_MODE_SCREEN, "Screen", true)
                            )
                            val modeLabel = modeList.firstOrNull { it.first == ledMode }?.second ?: "Solid"
                            var modeMenu by remember { mutableStateOf(false) }
                            val menuState = remember { MutableTransitionState(false) }
                            menuState.targetState = modeMenu
                            var anchorW by remember { mutableIntStateOf(0) }
                            var anchorH by remember { mutableIntStateOf(0) }
                            val density = LocalDensity.current
                            val arrowRot by animateFloatAsState(
                                if (modeMenu) 90f else -90f, tween(250), label = "modeArrow"
                            )
                            val briTop = if (ledKelvinMode) LedColor.kelvinScreenColor(ledKelvin)
                            else Color(AndroidColor.HSVToColor(floatArrayOf(shownHue, sat, 1f)))
                            fun hsvColor(h: Float, s: Float) =
                                Color(AndroidColor.HSVToColor(floatArrayOf(h, s, 1f)))

                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .statusBarsPadding()
                                    .navigationBarsPadding()
                                    .verticalScroll(rememberScrollState())
                                    .padding(horizontal = screenPadding(), vertical = 12.dp)
                            ) {
                                // ── Header ──
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.entrance(0)
                                ) {
                                    Text(
                                        "Glow",
                                        style = MaterialTheme.typography.headlineMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = onBg,
                                        maxLines = 1,
                                        modifier = Modifier.weight(1f)
                                    )
                                    CircleIconButton(R.drawable.settings, "Settings") { showSettings = true }
                                    Spacer(Modifier.width(8.dp))
                                    val powerBg by animateColorAsState(
                                        if (ledOn) activeFill() else onBg.copy(alpha = 0.07f),
                                        tween(250), label = "powerBg"
                                    )
                                    val powerFg by animateColorAsState(
                                        if (ledOn) onActiveFill() else onBg.copy(alpha = 0.7f),
                                        tween(250), label = "powerFg"
                                    )
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(circle())
                                            .background(powerBg)
                                            .bounceClickable { togglePower() }
                                    ) {
                                        Icon(
                                            painter = painterResource(R.drawable.power),
                                            contentDescription = if (ledOn) "Turn off" else "Turn on",
                                            modifier = Modifier.size(20.dp),
                                            tint = powerFg
                                        )
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().entrance(0)
                                ) {
                                    Box(Modifier.weight(1f, fill = false)) {
                                        StatusPill(
                                            text = "Connected" + (boardVersion?.let { " · v$it" } ?: ""),
                                            active = true
                                        )
                                    }
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        "Disconnect",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = onBg.copy(alpha = 0.5f),
                                        maxLines = 1,
                                        softWrap = false,
                                        modifier = Modifier
                                            .clip(circle())
                                            .bounceClickable { bleManager.disconnect() }
                                            .padding(horizontal = 8.dp, vertical = 6.dp)
                                    )
                                }

                                Spacer(Modifier.height(4.dp))

                                // ── Live preview ──
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    modifier = Modifier.fillMaxWidth().entrance(1)
                                ) {
                                    LedPreview(
                                        hue = previewHue, sat = previewSat, value = previewVal,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(if (isCompact()) 176.dp else 220.dp)
                                    )
                                    AnimatedContent(
                                        targetState = if (ledOn) modeName else "Off",
                                        transitionSpec = {
                                            (fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 2 })
                                                .togetherWith(fadeOut(tween(150)))
                                        },
                                        label = "modeName"
                                    ) { name ->
                                        Text(
                                            name,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = onBg.copy(alpha = 0.85f),
                                            maxLines = 1
                                        )
                                    }
                                }

                                Spacer(Modifier.height(12.dp))

                                // ── Mode (dropdown) ──
                                PanelCard(Modifier.entrance(2)) {
                                    Box {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .onSizeChanged { anchorW = it.width; anchorH = it.height }
                                                .clip(rounded(14.dp))
                                                .background(onBg.copy(alpha = 0.07f))
                                                .bounceClickable(pressedScale = 0.98f) { modeMenu = !modeMenu }
                                                .padding(horizontal = 16.dp, vertical = 12.dp)
                                        ) {
                                            Text(
                                                "Mode",
                                                style = MaterialTheme.typography.labelMedium,
                                                color = onBg.copy(alpha = 0.5f)
                                            )
                                            Spacer(Modifier.width(14.dp))
                                            Box(Modifier.weight(1f)) {
                                                AnimatedContent(
                                                    targetState = modeLabel,
                                                    transitionSpec = {
                                                        (fadeIn(tween(200)) + slideInVertically(tween(200)) { it / 2 })
                                                            .togetherWith(fadeOut(tween(120)))
                                                    },
                                                    label = "modeLabel"
                                                ) { label ->
                                                    Text(
                                                        label,
                                                        style = MaterialTheme.typography.titleSmall,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = onBg,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }
                                            Icon(
                                                painter = painterResource(R.drawable.arrow_back),
                                                contentDescription = null,
                                                modifier = Modifier.size(18.dp).rotate(arrowRot),
                                                tint = onBg.copy(alpha = 0.6f)
                                            )
                                        }
                                        if (menuState.currentState || menuState.targetState) {
                                            Popup(
                                                alignment = Alignment.TopStart,
                                                offset = IntOffset(0, anchorH + with(density) { 8.dp.roundToPx() }),
                                                onDismissRequest = { modeMenu = false },
                                                properties = PopupProperties(focusable = true)
                                            ) {
                                              Box {
                                                androidx.compose.animation.AnimatedVisibility(
                                                    visibleState = menuState,
                                                    enter = fadeIn(tween(180)) + scaleIn(
                                                        tween(220), initialScale = 0.9f,
                                                        transformOrigin = TransformOrigin(0.5f, 0f)
                                                    ),
                                                    exit = fadeOut(tween(120)) + scaleOut(
                                                        tween(150), targetScale = 0.92f,
                                                        transformOrigin = TransformOrigin(0.5f, 0f)
                                                    )
                                                ) {
                                                    val menuShape = rounded(20.dp)
                                                    Column(
                                                        Modifier
                                                            .width(with(density) { anchorW.toDp() })
                                                            .clip(menuShape)
                                                            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
                                                            .border(1.dp, onBg.copy(alpha = 0.1f), menuShape)
                                                            .padding(6.dp)
                                                    ) {
                                                        modeList.forEach { (mode, label, enabled) ->
                                                            val sel = mode == ledMode
                                                            Row(
                                                                verticalAlignment = Alignment.CenterVertically,
                                                                modifier = Modifier
                                                                    .fillMaxWidth()
                                                                    .clip(rounded(14.dp))
                                                                    .background(
                                                                        if (sel) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                                                                        else Color.Transparent
                                                                    )
                                                                    .alpha(if (enabled) 1f else 0.35f)
                                                                    .bounceClickable(enabled = enabled, pressedScale = 0.97f) {
                                                                        modeMenu = false; startMode(mode)
                                                                    }
                                                                    .padding(horizontal = 14.dp, vertical = 12.dp)
                                                            ) {
                                                                Text(
                                                                    label,
                                                                    modifier = Modifier.weight(1f),
                                                                    style = MaterialTheme.typography.bodyLarge,
                                                                    fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal,
                                                                    color = if (sel) MaterialTheme.colorScheme.primary else onBg
                                                                )
                                                                if (sel) Box(
                                                                    Modifier
                                                                        .size(8.dp)
                                                                        .clip(circle())
                                                                        .background(MaterialTheme.colorScheme.primary)
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                              }
                                            }
                                        }
                                    }
                                    if (!fwEffects) {
                                        Spacer(Modifier.height(8.dp))
                                        Text(
                                            "Update the board firmware (Settings) for all modes.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = onBg.copy(alpha = 0.5f)
                                        )
                                    }
                                }

                                if (ledMode == LED_MODE_MUSIC) {
                                    Spacer(Modifier.height(12.dp))
                                    MusicPanel(
                                        level = liveLevel,
                                        sensitivity = musicSensitivity,
                                        onSensitivity = { musicSensitivity = it },
                                        onSensitivityDone = { ledStore.musicSensitivity = musicSensitivity },
                                        keepColour = musicKeepColour,
                                        onKeepColour = { musicKeepColour = it },
                                        micAllowed = micGranted(),
                                        modifier = Modifier.entrance(2)
                                    )
                                } else if (ledMode == LED_MODE_VISUALIZER) {
                                    Spacer(Modifier.height(12.dp))
                                    VisualizerPanel(
                                        level = liveLevel,
                                        running = syncActive == SyncKind.VISUALIZER,
                                        sensitivity = musicSensitivity,
                                        onSensitivity = { musicSensitivity = it },
                                        onSensitivityDone = { ledStore.musicSensitivity = musicSensitivity },
                                        onStop = { startMode(LED_MODE_SOLID) },
                                        modifier = Modifier.entrance(2)
                                    )
                                } else if (ledMode == LED_MODE_SCREEN) {
                                    Spacer(Modifier.height(12.dp))
                                    ScreenSyncPanel(
                                        running = syncActive == SyncKind.SCREEN,
                                        onStop = { startMode(LED_MODE_SOLID) },
                                        modifier = Modifier.entrance(2)
                                    )
                                }

                                Spacer(Modifier.height(12.dp))

                                // ── Brightness ──
                                PanelCard(Modifier.entrance(3)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            "Brightness",
                                            style = MaterialTheme.typography.titleSmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = onBg,
                                            modifier = Modifier.weight(1f)
                                        )
                                        Text(
                                            "${(bri * 100).roundToInt()} %",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = onBg.copy(alpha = 0.6f)
                                        )
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    GradientBar(
                                        fraction = bri,
                                        stops = listOf(Color.Black, briTop),
                                        thumbColor = briTop,
                                        onFraction = {
                                            bri = it
                                            if (it >= MIN_VISIBLE_BRIGHTNESS) lastOnBri = it
                                            sendThrottled()
                                        },
                                        onFinished = { sendCurrent() }
                                    )
                                }

                                Spacer(Modifier.height(12.dp))

                                // ── Colour ──
                                PanelCard(Modifier.entrance(4)) {
                                    SegmentedPill(listOf("Color", "Kelvin"), if (ledKelvinMode) 1 else 0) {
                                        ledKelvinMode = it == 1
                                        if (ledKelvinMode) { setKelvin(ledKelvin); sendCurrent() }
                                    }
                                    Spacer(Modifier.height(12.dp))

                                    AnimatedContent(
                                        targetState = ledKelvinMode,
                                        transitionSpec = { fadeIn(tween(220)).togetherWith(fadeOut(tween(140))) },
                                        label = "colourControls"
                                    ) { kel ->
                                        Column {
                                            if (kel) {
                                                SliderLabel("Temperature")
                                                GradientBar(
                                                    fraction = (ledKelvin - LedColor.KELVIN_MIN) /
                                                        (LedColor.KELVIN_MAX - LedColor.KELVIN_MIN),
                                                    stops = (0..8).map {
                                                        LedColor.kelvinScreenColor(
                                                            LedColor.KELVIN_MIN + it / 8f * (LedColor.KELVIN_MAX - LedColor.KELVIN_MIN)
                                                        )
                                                    },
                                                    thumbColor = LedColor.kelvinScreenColor(ledKelvin),
                                                    onFraction = {
                                                        setKelvin(LedColor.KELVIN_MIN + it * (LedColor.KELVIN_MAX - LedColor.KELVIN_MIN))
                                                        sendThrottled()
                                                    },
                                                    onFinished = { sendCurrent() }
                                                )
                                            } else {
                                                SliderLabel("Hue")
                                                GradientBar(
                                                    fraction = shownHue / 360f,
                                                    stops = (0..6).map { hsvColor(it * 60f, 1f) },
                                                    thumbColor = hsvColor(shownHue, 1f),
                                                    onFraction = {
                                                        hue = it * 360f
                                                        colourPicked()
                                                        sendThrottled()
                                                    },
                                                    onFinished = { sendCurrent() }
                                                )
                                                Spacer(Modifier.height(6.dp))
                                                SliderLabel("Saturation")
                                                GradientBar(
                                                    fraction = sat,
                                                    stops = listOf(hsvColor(shownHue, 0f), hsvColor(shownHue, 1f)),
                                                    thumbColor = hsvColor(shownHue, sat),
                                                    onFraction = { sat = it; sendThrottled() },
                                                    onFinished = { sendCurrent() }
                                                )
                                            }
                                            Spacer(Modifier.height(14.dp))
                                            Row(
                                                Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                if (kel) {
                                                    listOf(1900f, 2700f, 3500f, 4500f, 5600f, 6500f).forEach { k ->
                                                        PresetDot(LedColor.kelvinScreenColor(k)) {
                                                            if (bri < MIN_VISIBLE_BRIGHTNESS) bri = lastOnBri
                                                            setKelvin(k); sendCurrent()
                                                        }
                                                    }
                                                } else {
                                                    LedPresets.forEach { preset ->
                                                        PresetDot(Color(preset)) {
                                                            val hsv = FloatArray(3)
                                                            AndroidColor.colorToHSV(preset, hsv)
                                                            hue = hsv[0]; sat = hsv[1]
                                                            colourPicked()
                                                            // A preset changes the colour, not the brightness you chose.
                                                            if (bri < MIN_VISIBLE_BRIGHTNESS) bri = lastOnBri
                                                            sendCurrent()
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(16.dp))
                            }
                        } else {
                            ConnectScreen(
                                connectionState = connectionState,
                                isScanning      = isScanning,
                                devices         = foundDevices,
                                picking         = pickingDevice,
                                mono            = mono,
                                onScan          = {
                                    checkPermissionsAndDo {
                                        pickingDevice = true
                                        bleManager.startScanning()
                                    }
                                },
                                onPick          = { device ->
                                    bleManager.stopScanning()
                                    pickingDevice = false
                                    bleManager.connect(device.address)
                                },
                                onCancel        = { bleManager.stopScanning(); pickingDevice = false },
                                onSettings      = { showSettings = true }
                            )
                        }
                    }
                }
            }
        }
        }
    }
}

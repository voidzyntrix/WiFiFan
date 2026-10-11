package io.github.voidqubex.wifi_fan

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothProfile
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.ota.AppUpdateState
import io.github.voidqubex.wifi_fan.ota.AppUpdater
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.led.LedColor
import io.github.voidqubex.wifi_fan.led.LedPreview
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ota.OtaState
import io.github.voidqubex.wifi_fan.ui.theme.AccentPresets
import io.github.voidqubex.wifi_fan.ui.theme.WiFiFanTheme
import kotlinx.coroutines.delay
import java.time.LocalTime
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random
import android.graphics.Color as AndroidColor

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------

class Particle(
    var xFrac: Float,
    var yFrac: Float,
    val speedFrac: Float,
    val radiusDp: Float,
    val alpha: Float,
    val xDriftFrac: Float
)

private fun spawnParticle(yFrac: Float) = Particle(
    xFrac = Random.nextFloat(),
    yFrac = yFrac,
    speedFrac = Random.nextFloat() * 0.0012f + 0.0003f,
    radiusDp = Random.nextFloat() * 2.5f + 0.8f,
    alpha = Random.nextFloat() * 0.055f + 0.018f,
    xDriftFrac = (Random.nextFloat() - 0.5f) * 0.00015f
)

@Composable
fun AmbientParticleBackground(
    modifier: Modifier = Modifier, active: Boolean, tint: Color
) {
    val particles = remember { mutableStateListOf<Particle>() }
    var frameNanos by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        repeat(12) { particles.add(spawnParticle(yFrac = Random.nextFloat())) }
    }

    LaunchedEffect(active) {
        while (true) {
            val target = if (active) 24 else 10
            if (particles.size < target) particles.add(spawnParticle(yFrac = 1.05f))
            delay(if (active) 650L else 2500L)
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { time ->
                frameNanos = time
                val iter = particles.iterator()
                while (iter.hasNext()) {
                    val p = iter.next()
                    p.yFrac -= p.speedFrac
                    p.xFrac = (p.xFrac + p.xDriftFrac).coerceIn(0f, 1f)
                    if (p.yFrac < -0.05f) iter.remove()
                }
            }
        }
    }

    Canvas(modifier = modifier) {
        @Suppress("UNUSED_EXPRESSION") frameNanos
        particles.forEach { p ->
            drawCircle(
                color = tint.copy(alpha = p.alpha),
                radius = p.radiusDp.dp.toPx(),
                center = Offset(p.xFrac * size.width, p.yFrac * size.height)
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Press feedback — replaces the default Material ripple with a subtle bounce
// ---------------------------------------------------------------------------

private const val LED_MODE_SOLID = 0
private const val LED_MODE_RAINBOW = 1
private const val LED_MODE_CANDLE = 2
private const val LED_MODE_BREATHE = 3
private const val LED_MODE_OCEAN = 4
private const val LED_MODE_PARTY = 5
private const val LED_MODE_AURORA = 6

/** Board effects (firmware 1.4.0+): mode -> (button label, command). */
private val LedEffects = listOf(
    Triple(LED_MODE_BREATHE, "Breathe", "breathe"),
    Triple(LED_MODE_OCEAN, "Ocean", "ocean"),
    Triple(LED_MODE_PARTY, "Party", "party"),
    Triple(LED_MODE_AURORA, "Aurora", "aurora")
)

/** Below this the LED is effectively off (1 % = 3 of 255), so there is nothing to preserve. */
private const val MIN_VISIBLE_BRIGHTNESS = 0.01f

/** Monochrome's button fill: the accent blended deep into the background. */
@Composable
private fun monoFill(strength: Float = 0.22f): Color {
    val cs = MaterialTheme.colorScheme
    return lerp(cs.background, cs.primary, strength)
}

/** Filled accent button, or in Monochrome a dark accent-tinted one with an accent rim. */
@Composable
private fun AppButton(
    mono: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = RoundedCornerShape(14.dp),
    interactionSource: MutableInteractionSource? = null,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    content: @Composable RowScope.() -> Unit
) {
    if (mono) {
        val fg = MaterialTheme.colorScheme.onBackground
        val fill = monoFill()
        Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = ButtonDefaults.buttonColors(
                containerColor = fill,
                contentColor = fg,
                disabledContainerColor = fill.copy(alpha = 0.4f),
                disabledContentColor = fg.copy(alpha = 0.3f)
            ),
            border = BorderStroke(
                1.5.dp,
                MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) 0.7f else 0.2f)
            ),
            contentPadding = contentPadding,
            content = content
        )
    } else {
        Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = colors,
            contentPadding = contentPadding,
            content = content
        )
    }
}

/** Scale modifier driven by a button's own [source], for Material buttons. */
@Composable
private fun pressScaleModifier(
    source: MutableInteractionSource, pressedScale: Float = 0.9f
): Modifier {
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "pressScale"
    )
    return Modifier.scale(scale)
}

/** Clickable with no ripple and a bounce on press — for custom (non-button) elements. */
@Composable
private fun Modifier.bounceClickable(
    enabled: Boolean = true, pressedScale: Float = 0.9f, onClick: () -> Unit
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "bounceClickable"
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = source, indication = null, enabled = enabled, onClick = onClick
        )
}

// ---------------------------------------------------------------------------
// Gradient bar — a draggable colour strip (hue, saturation, brightness, kelvin)
// ---------------------------------------------------------------------------

@Composable
private fun GradientBar(
    fraction: Float,
    stops: List<Color>,
    thumbColor: Color,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit
) {
    val currentOnFraction by rememberUpdatedState(onFraction)
    val currentOnFinished by rememberUpdatedState(onFinished)

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fun report(p: Offset) = currentOnFraction((p.x / size.width).coerceIn(0f, 1f))
                    report(down.position)
                    down.consume()
                    drag(down.id) { change -> report(change.position); change.consume() }
                    currentOnFinished()
                }
            }) {
        val barH = 14.dp.toPx()
        val top = (size.height - barH) / 2f
        drawRoundRect(
            brush = Brush.horizontalGradient(stops),
            topLeft = Offset(0f, top),
            size = androidx.compose.ui.geometry.Size(size.width, barH),
            cornerRadius = CornerRadius(barH / 2f)
        )
        val tc = Offset(fraction * size.width, size.height / 2f)
        drawCircle(Color.Black.copy(alpha = 0.3f), radius = 13.dp.toPx(), center = tc)
        drawCircle(Color.White, radius = 11.dp.toPx(), center = tc)
        drawCircle(thumbColor, radius = 8.dp.toPx(), center = tc)
    }
}

private val LedPresets = listOf(
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

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
class MainActivity : ComponentActivity() {
    private lateinit var bleManager: BleManager
    private lateinit var otaManager: OtaManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bleManager = BleManager(this)
        otaManager = OtaManager(bleManager, lifecycleScope)
        val settingsStore = SettingsStore(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        enableEdgeToEdge()
        setContent {
            var uiLayout by remember { mutableStateOf(settingsStore.uiLayout) }
            var colorScheme by remember { mutableStateOf(settingsStore.colorScheme) }
            var accentColor by remember { mutableIntStateOf(settingsStore.accentColor) }
            var background by remember { mutableStateOf(settingsStore.background) }
            var rainbowSync by remember { mutableStateOf(settingsStore.rainbowSync) }

            WiFiFanTheme(
                colored = colorScheme == AppColorScheme.COLORED, accent = Color(accentColor)
            ) {
                Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                    BleControlScreen(
                        bleManager = bleManager,
                        otaManager         = otaManager,
                        uiLayout = uiLayout,
                        colorScheme = colorScheme,
                        accentColor = accentColor,
                        background = background,
                        rainbowSync = rainbowSync,
                        onRainbowSyncChange = { rainbowSync = it; settingsStore.rainbowSync = it },
                        onLayoutChange = { uiLayout = it; settingsStore.uiLayout = it },
                        onColorChange = { colorScheme = it; settingsStore.colorScheme = it },
                        onAccentChange = { accentColor = it; settingsStore.accentColor = it },
                        onBackgroundChange = { background = it; settingsStore.background = it })
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        bleManager.disconnect()
    }
}

class Commands {
    companion object {
        const val OFF: String = "off"
        const val LED: String = "l="           // l=R/G/B (0-255), older firmware
        const val LED_HSV: String = "h="       // h=H/S/V: hue 0-359, sat/brightness 0-100 (firmware 1.1.0+)
        const val CANDLE: String = "candle"   // candle=V: flickering candle flame (firmware 1.2.0+)
        const val RAINBOW: String = "rain"     // rain=S/V: start rainbow / adjust its sat/brightness
    }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

@SuppressLint("ObsoleteSdkInt", "MissingPermission", "UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun BleControlScreen(
    bleManager: BleManager,
    otaManager: OtaManager,
    uiLayout: UiLayout,
    colorScheme: AppColorScheme,
    accentColor: Int,
    background: AppBackground,
    rainbowSync: Boolean,
    onRainbowSyncChange: (Boolean) -> Unit,
    onLayoutChange: (UiLayout) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val isDark = isSystemInDarkTheme()
    val mono = colorScheme == AppColorScheme.MONOCHROME

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
    fun candleCommand(bri: Float) = Commands.CANDLE + "=${(bri * 100).roundToInt()}" +
        if (fwOptions) "/${if (smoothCandle) 1 else 0}/$candleHue" else ""
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

    // Solid colour: HSV (hue in degrees, saturation/brightness in percent).
    fun sendSolid() {
        val color = AndroidColor.HSVToColor(floatArrayOf(hue, sat, bri))
        bleManager.sendData(
            if (hsvCommands) {
                Commands.LED_HSV +
                    "${hue.roundToInt() % 360}/${(sat * 100).roundToInt()}/${(bri * 100).roundToInt()}"
            } else {
                Commands.LED +
                    "${AndroidColor.red(color)}/${AndroidColor.green(color)}/${AndroidColor.blue(color)}"
            }
        )
        ledColor = color
        ledMode = LED_MODE_SOLID
    }

    // Rainbow: keeps cycling on the board, only saturation/brightness change.
    fun sendRainbow() {
        bleManager.sendData(rainbowCommand(sat, bri))
        ledColor = AndroidColor.HSVToColor(floatArrayOf(hue, sat, bri))
        ledMode = LED_MODE_RAINBOW
    }

    // Kelvin is just another way to pick hue/saturation: same commands as the colour picker.
    fun setKelvin(k: Float) {
        ledKelvin = k
        val hs = LedColor.kelvinToHueSat(k)
        hue = hs[0]; sat = hs[1]
        ledMode = LED_MODE_SOLID
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
        LED_MODE_BREATHE, LED_MODE_OCEAN, LED_MODE_PARTY, LED_MODE_AURORA -> sendEffect(ledMode)
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
            ledMode = lastOnMode
            sendCurrent()
        }
    }

    // Start a mode from the mode chips.
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
            else -> { if (ledKelvinMode) ledKelvinMode = false; sendEffect(mode) }
        }
    }

    // What the preview shows: the board's mode, approximated.
    val previewHue = when (ledMode) {
        LED_MODE_RAINBOW, LED_MODE_PARTY -> rainbowHue
        LED_MODE_CANDLE -> candleHue.toFloat()
        LED_MODE_OCEAN -> 205f + 20f * sin(rainbowHue / 360f * 6.2832f)
        LED_MODE_AURORA -> 200f + 80f * sin(rainbowHue / 360f * 6.2832f / 4f)
        else -> hue
    }
    val previewSat = when (ledMode) {
        LED_MODE_CANDLE -> 0.94f
        LED_MODE_OCEAN -> 0.9f
        LED_MODE_AURORA -> 0.82f
        LED_MODE_PARTY -> 1f
        else -> sat
    }
    val previewVal = when (ledMode) {
        LED_MODE_CANDLE -> bri * (0.82f + 0.1f * sin(rainbowHue / 360f * 6.2832f * 2f))
        LED_MODE_BREATHE -> bri * (0.575f + 0.425f * sin(rainbowHue / 360f * 6.2832f))
        else -> bri
    }
    val modeName = when (ledMode) {
        LED_MODE_RAINBOW -> "Rainbow"
        LED_MODE_CANDLE -> "Candle"
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
                        uiLayout = uiLayout,
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
                        onLayoutChange = onLayoutChange,
                        onColorChange = onColorChange,
                        onAccentChange = onAccentChange,
                        onBackgroundChange = onBackgroundChange,
                        otaManager = otaManager,
                        boardVersion = boardVersion,
                        isConnected = isConnected,
                        onBack = { showSettings = false })
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
                            ) + LedEffects.map { Triple(it.first, it.second, fwEffects) }
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
                                    .padding(horizontal = 20.dp, vertical = 12.dp)
                            ) {
                                // ── Header ──
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.entrance(0)
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            "Glow",
                                            style = MaterialTheme.typography.headlineMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = onBg
                                        )
                                        Spacer(Modifier.height(6.dp))
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            StatusPill(
                                                text = "Connected" + (boardVersion?.let { " · v$it" } ?: ""),
                                                active = true
                                            )
                                            Spacer(Modifier.width(8.dp))
                                            Text(
                                                "Disconnect",
                                                style = MaterialTheme.typography.labelMedium,
                                                color = onBg.copy(alpha = 0.5f),
                                                modifier = Modifier
                                                    .clip(CircleShape)
                                                    .bounceClickable { bleManager.disconnect() }
                                                    .padding(horizontal = 8.dp, vertical = 6.dp)
                                            )
                                        }
                                    }
                                    val powerBg by animateColorAsState(
                                        if (ledOn) MaterialTheme.colorScheme.primary else onBg.copy(alpha = 0.07f),
                                        tween(250), label = "powerBg"
                                    )
                                    val powerFg by animateColorAsState(
                                        if (ledOn) MaterialTheme.colorScheme.onPrimary else onBg.copy(alpha = 0.7f),
                                        tween(250), label = "powerFg"
                                    )
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
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
                                    Spacer(Modifier.width(8.dp))
                                    CircleIconButton(R.drawable.settings, "Settings") { showSettings = true }
                                }

                                Spacer(Modifier.height(8.dp))

                                // ── Live preview ──
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    modifier = Modifier.fillMaxWidth().entrance(1)
                                ) {
                                    LedPreview(
                                        hue = previewHue, sat = previewSat, value = previewVal,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(220.dp)
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
                                            color = onBg.copy(alpha = 0.85f)
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
                                                .clip(RoundedCornerShape(14.dp))
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
                                                        color = onBg
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
                                                    val menuShape = RoundedCornerShape(20.dp)
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
                                                                    .clip(RoundedCornerShape(14.dp))
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
                                                                        .clip(CircleShape)
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
                                    // Segmented switch with a sliding thumb.
                                    val thumb by animateFloatAsState(
                                        if (ledKelvinMode) 1f else 0f,
                                        spring(stiffness = Spring.StiffnessMediumLow), label = "segThumb"
                                    )
                                    BoxWithConstraints(
                                        Modifier
                                            .fillMaxWidth()
                                            .height(40.dp)
                                            .clip(RoundedCornerShape(20.dp))
                                            .background(onBg.copy(alpha = 0.08f))
                                    ) {
                                        val half = maxWidth / 2
                                        Box(
                                            Modifier
                                                .offset(x = half * thumb)
                                                .width(half)
                                                .fillMaxHeight()
                                                .padding(3.dp)
                                                .clip(RoundedCornerShape(17.dp))
                                                .background(MaterialTheme.colorScheme.primary)
                                        )
                                        Row(Modifier.fillMaxSize()) {
                                            listOf(false to "Color", true to "Kelvin").forEach { (kel, label) ->
                                                val sel = ledKelvinMode == kel
                                                val fg by animateColorAsState(
                                                    if (sel) MaterialTheme.colorScheme.onPrimary else onBg.copy(alpha = 0.7f),
                                                    tween(200), label = "segFg"
                                                )
                                                Box(
                                                    contentAlignment = Alignment.Center,
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .fillMaxHeight()
                                                        .clickable(
                                                            interactionSource = remember { MutableInteractionSource() },
                                                            indication = null
                                                        ) {
                                                            if (kel != ledKelvinMode) {
                                                                ledKelvinMode = kel
                                                                if (kel) { setKelvin(ledKelvin); sendSolid() }
                                                            }
                                                        }
                                                ) {
                                                    Text(label, style = MaterialTheme.typography.labelLarge, color = fg)
                                                }
                                            }
                                        }
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
                                                        ledMode = LED_MODE_SOLID
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
                                                            setKelvin(k); sendSolid()
                                                        }
                                                    }
                                                } else {
                                                    LedPresets.forEach { preset ->
                                                        PresetDot(Color(preset)) {
                                                            val hsv = FloatArray(3)
                                                            AndroidColor.colorToHSV(preset, hsv)
                                                            hue = hsv[0]; sat = hsv[1]
                                                            // A preset changes the colour, not the brightness you chose.
                                                            if (bri < MIN_VISIBLE_BRIGHTNESS) bri = lastOnBri
                                                            sendSolid()
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

/** The blurred screen backdrop that [PanelCard] draws behind itself. */
private val LocalBlurLayer = staticCompositionLocalOf<GraphicsLayer?> { null }

/** Rounded translucent panel that groups a block of controls. */
@Composable
private fun PanelCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val blurLayer = LocalBlurLayer.current
    var pos by remember { mutableStateOf(Offset.Zero) }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .onGloballyPositioned { pos = it.positionInRoot() }
            .clip(RoundedCornerShape(24.dp))
            // frosted glass: the blurred backdrop, shifted so it lines up with the screen
            .drawBehind {
                if (blurLayer != null) translate(-pos.x, -pos.y) { drawLayer(blurLayer) }
            }
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.4f))
            .border(
                1.dp,
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f),
                RoundedCornerShape(24.dp)
            )
            .padding(18.dp),
        content = content
    )
}

/** Fade + slide up when first shown, staggered by [index]. */
@Composable
private fun Modifier.entrance(index: Int): Modifier {
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(index * 70L)
        p.animateTo(1f, tween(450, easing = FastOutSlowInEasing))
    }
    return this.graphicsLayer {
        alpha = p.value
        translationY = (1f - p.value) * 36.dp.toPx()
    }
}

@Composable
private fun SliderLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
    )
}

/** One mode in the Mode panel; the selected one is filled with the accent colour. */
@Composable
private fun ModeChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg by animateColorAsState(
        if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f),
        tween(200), label = "chipBg"
    )
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .alpha(if (enabled) 1f else 0.35f)
            .bounceClickable(enabled = enabled, pressedScale = 0.94f, onClick = onClick)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) MaterialTheme.colorScheme.onPrimary
            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
        )
    }
}

@Composable
private fun PresetDot(color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(CircleShape)
            .background(color)
            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f), CircleShape)
            .bounceClickable(pressedScale = 0.85f, onClick = onClick)
    )
}

@Composable
private fun CircleIconButton(icon: Int, description: String, onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.07f))
            .bounceClickable(onClick = onClick)
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = description,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )
    }
}

// ---------------------------------------------------------------------------
// Connect screen — shown while no board is connected: a glowing LED beacon that
// pulses while searching, a status pill, and the nearby devices listed inline.
// ---------------------------------------------------------------------------

@SuppressLint("MissingPermission")
@Composable
private fun ConnectScreen(
    connectionState: Int,
    isScanning: Boolean,
    devices: Set<BluetoothDevice>,
    picking: Boolean,
    mono: Boolean,
    onScan: () -> Unit,
    onPick: (BluetoothDevice) -> Unit,
    onCancel: () -> Unit,
    onSettings: () -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val connecting = connectionState == BluetoothProfile.STATE_CONNECTING
    val searching = connecting || (picking && isScanning)
    val status = when {
        connecting                                              -> "Connecting…"
        connectionState == BluetoothProfile.STATE_DISCONNECTING -> "Disconnecting…"
        picking && isScanning                                   -> "Searching for LEDs…"
        picking                                                 -> "Pick your board"
        else                                                    -> "Not connected"
    }
    val beaconSize by animateDpAsState(
        if (picking) 170.dp else 240.dp, tween(450), label = "beaconSize"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Scrim so the text stays readable over an image wallpaper.
        val bg = MaterialTheme.colorScheme.background
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .background(Brush.verticalGradient(listOf(Color.Transparent, bg.copy(alpha = 0.85f))))
        )
        // Settings gear, top-end
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .size(40.dp)
                .clip(CircleShape)
                .bounceClickable(onClick = onSettings),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(R.drawable.settings),
                contentDescription = "Settings",
                modifier = Modifier.size(20.dp),
                tint = onBg.copy(alpha = 0.35f)
            )
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.weight(1f))
            GlowBeacon(active = searching, modifier = Modifier.size(beaconSize))
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Glow",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Light,
                letterSpacing = 2.sp,
                color = onBg
            )
            Spacer(Modifier.height(12.dp))
            StatusPill(text = status, active = searching)
            Spacer(Modifier.weight(1f))

            AnimatedContent(
                targetState = picking,
                transitionSpec = {
                    (fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 4 })
                        .togetherWith(fadeOut(tween(200)))
                },
                label = "connectBottom"
            ) { showList ->
                if (showList) {
                    DeviceList(
                        devices = devices,
                        isScanning = isScanning,
                        mono = mono,
                        onPick = onPick,
                        onScan = onScan,
                        onCancel = onCancel
                    )
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "Power the LED board and keep your phone nearby.",
                            style = MaterialTheme.typography.bodySmall,
                            textAlign = TextAlign.Center,
                            color = onBg.copy(alpha = 0.6f)
                        )
                        Spacer(Modifier.height(16.dp))
                        val connectSrc = remember { MutableInteractionSource() }
                        AppButton(
                            mono = mono,
                            onClick = onScan,
                            shape = CircleShape,
                            enabled = connectionState == BluetoothProfile.STATE_DISCONNECTED,
                            interactionSource = connectSrc,
                            modifier = pressScaleModifier(connectSrc, pressedScale = 0.96f)
                                .fillMaxWidth()
                                .height(56.dp)
                        ) {
                            Text("Connect", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }
    }
}

/** A slowly colour-cycling LED glow; sends out rings while [active]. */
@Composable
private fun GlowBeacon(active: Boolean, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "beacon")
    val pulse by t.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2400, easing = LinearEasing)),
        label = "beaconPulse"
    )
    val hue by t.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(12000, easing = LinearEasing)),
        label = "beaconHue"
    )
    val ringAlpha by animateFloatAsState(if (active) 1f else 0f, tween(500), label = "beaconRings")
    val glow = Color(AndroidColor.HSVToColor(floatArrayOf(hue, 0.75f, 1f)))

    Canvas(modifier) {
        val maxR = size.minDimension / 2f
        drawCircle(
            brush = Brush.radialGradient(listOf(glow.copy(alpha = 0.35f), Color.Transparent), center, maxR),
            radius = maxR
        )
        if (ringAlpha > 0f) {
            for (i in 0 until 3) {
                val p = (pulse + i / 3f) % 1f
                drawCircle(
                    color = glow.copy(alpha = (1f - p) * 0.5f * ringAlpha),
                    radius = maxR * (0.36f + 0.64f * p),
                    style = Stroke(width = 1.5.dp.toPx())
                )
            }
        }
        val coreR = maxR * 0.34f
        drawCircle(
            brush = Brush.radialGradient(
                listOf(Color.White, glow, glow.copy(alpha = 0.6f)), center, coreR
            ),
            radius = coreR
        )
    }
}

@Composable
private fun StatusPill(text: String, active: Boolean) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val blink by rememberInfiniteTransition(label = "statusBlink").animateFloat(
        initialValue = 0.35f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "statusDot"
    )
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.55f))
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(
                    if (active) MaterialTheme.colorScheme.primary.copy(alpha = blink)
                    else onBg.copy(alpha = 0.3f)
                )
        )
        Spacer(Modifier.width(8.dp))
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = onBg.copy(alpha = 0.8f))
    }
}

@SuppressLint("MissingPermission")
@Composable
private fun DeviceList(
    devices: Set<BluetoothDevice>,
    isScanning: Boolean,
    mono: Boolean,
    onPick: (BluetoothDevice) -> Unit,
    onScan: () -> Unit,
    onCancel: () -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(24.dp)
    // Named devices first; unnamed ones are rarely the board.
    val sorted = remember(devices) {
        devices.sortedWith(compareBy({ it.name == null }, { it.name ?: it.address }))
    }
    val iconFill = if (mono) monoFill() else cs.primary.copy(alpha = 0.15f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(cs.surface.copy(alpha = 0.85f))
            .border(1.dp, cs.onBackground.copy(alpha = 0.08f), shape)
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Nearby devices",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = cs.onSurface,
                modifier = Modifier.weight(1f)
            )
            if (isScanning) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp), strokeWidth = 2.dp, strokeCap = StrokeCap.Round
                )
            }
        }
        if (sorted.isEmpty()) {
            Text(
                text = if (isScanning) "Looking for LED boards…" else "No devices found. Is the board powered?",
                style = MaterialTheme.typography.bodySmall,
                color = cs.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp)
            )
        } else {
            LazyColumn(Modifier.heightIn(max = 280.dp)) {
                items(sorted, key = { it.address }) { device ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .bounceClickable(pressedScale = 0.97f) { onPick(device) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(iconFill),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.led),
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = device.name ?: "Unknown device",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                                color = cs.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = device.address,
                                style = MaterialTheme.typography.bodySmall,
                                color = cs.onSurface.copy(alpha = 0.45f)
                            )
                        }
                        Icon(
                            painter = painterResource(R.drawable.arrow_back),
                            contentDescription = null,
                            modifier = Modifier
                                .size(18.dp)
                                .rotate(180f),
                            tint = cs.onSurface.copy(alpha = 0.35f)
                        )
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.End
        ) {
            if (!isScanning) TextButton(onClick = onScan) { Text("Scan again") }
            TextButton(onClick = onCancel) { Text("Cancel") }
        }
    }
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

@Composable
private fun SettingsScreen(
    uiLayout: UiLayout,
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
    onLayoutChange: (UiLayout) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    otaManager: OtaManager,
    boardVersion: String?,
    isConnected: Boolean,
    onBack: () -> Unit
) {
    val otaState by otaManager.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            // Settings always uses the plain theme background, never the wallpaper.
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .bounceClickable { if (!otaState.busy) onBack() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(R.drawable.arrow_back),
                    contentDescription = "Back",
                    modifier = Modifier.size(22.dp),
                    tint = MaterialTheme.colorScheme.onBackground
                )
            }
            Spacer(Modifier.width(4.dp))
            Text(
                text = "Settings",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        Spacer(Modifier.height(28.dp))

        SettingsCategory("Board LED")
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Smooth candle",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = "Slow, gentle flicker (easier on the eyes at night)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                )
            }
            Switch(checked = smoothCandle, onCheckedChange = onSmoothCandleChange)
        }

        Spacer(Modifier.height(24.dp))
        SettingHeading("Candle colour", "Tint of the candle flame")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(Triple("Ember", "deep red", 10), Triple("Warm", "orange", 19), Triple("Amber", "yellowish", 30))
                .forEach { (label, desc, hueDeg) ->
                    ChoiceCard(
                        label = label, description = desc,
                        selected = candleHue == hueDeg,
                        modifier = Modifier.weight(1f),
                        onClick = { onCandleHueChange(hueDeg) }
                    )
                }
        }

        Spacer(Modifier.height(24.dp))
        SettingHeading("Rainbow speed", "Time for one trip round the colour wheel")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(Triple("Slow", "30 s", 30), Triple("Normal", "15 s", 15), Triple("Fast", "6 s", 6))
                .forEach { (label, desc, sec) ->
                    ChoiceCard(
                        label = label, description = desc,
                        selected = rainbowSeconds == sec,
                        modifier = Modifier.weight(1f),
                        onClick = { onRainbowSecondsChange(sec) }
                    )
                }
        }

        Spacer(Modifier.height(24.dp))
        SettingHeading("Colour fade", "How fast the LED changes to a new colour")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(Triple("Quick", "0.5 s", 500), Triple("Normal", "1.5 s", 1500), Triple("Slow", "3 s", 3000))
                .forEach { (label, desc, ms) ->
                    ChoiceCard(
                        label = label, description = desc,
                        selected = fadeMs == ms,
                        modifier = Modifier.weight(1f),
                        onClick = { onFadeMsChange(ms) }
                    )
                }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Candle options, rainbow speed and fade need board firmware 1.3.0 or newer.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
        )


        Spacer(Modifier.height(40.dp))
        SettingsCategory("App UI")
        // ── Background ──────────────────────────────────────────────
        SettingHeading("Background", "What appears behind the controls")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChoiceCard(
                label = "Particles",
                description = "Gentle drifting dots",
                selected = background == AppBackground.SIMPLE,
                modifier = Modifier.weight(1f),
                onClick = { onBackgroundChange(AppBackground.SIMPLE) })
            ChoiceCard(
                label = "Image",
                description = "An image wallpaper",
                selected = background == AppBackground.IMAGE,
                modifier = Modifier.weight(1f),
                onClick = { onBackgroundChange(AppBackground.IMAGE) })
        }

        Spacer(Modifier.height(32.dp))

        // ── Color Scheme ────────────────────────────────────────────
        SettingHeading("Color", "Accent and overall tone")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChoiceCard(
                label = "Monochrome",
                description = "Grayscale, accent on the edges",
                selected = colorScheme == AppColorScheme.MONOCHROME,
                modifier = Modifier.weight(1f),
                onClick = { onColorChange(AppColorScheme.MONOCHROME) })
            ChoiceCard(
                label = "Colored",
                description = "Choose a custom color",
                selected = colorScheme == AppColorScheme.COLORED,
                modifier = Modifier.weight(1f),
                onClick = { onColorChange(AppColorScheme.COLORED) })
        }

        // ── Accent picker — only relevant for the Colored scheme ─────
        if (colorScheme == AppColorScheme.COLORED) {
            Spacer(Modifier.height(28.dp))
            AccentColorPicker(selected = accentColor, onPick = onAccentChange)
        }

        Spacer(Modifier.height(32.dp))

        SettingHeading("LED dialog", "While the rainbow runs")
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Animate the hue slider and hex code",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f)
            )
            Switch(checked = rainbowSync, onCheckedChange = onRainbowSyncChange)
        }

        Spacer(Modifier.height(32.dp))
        SettingHeading("Behaviour", "Screen and notifications")
        Spacer(Modifier.height(12.dp))
        listOf(
            Triple("Keep screen on", keepScreenOn, onKeepScreenOnChange),
            Triple("Update notifications at launch", updateToasts, onUpdateToastsChange)
        ).forEach { (label, checked, onChange) ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.weight(1f)
                )
                Switch(checked = checked, onCheckedChange = onChange)
            }
        }


        Spacer(Modifier.height(40.dp))
        SettingsCategory("Firmware & updates")
        // ── Firmware update over Bluetooth ──────────────────────────
        FirmwareSection(
            otaManager   = otaManager,
            state        = otaState,
            boardVersion = boardVersion,
            isConnected  = isConnected
        )

        Spacer(Modifier.height(32.dp))

        // ── App update from GitHub releases ─────────────────────────
        AppUpdateSection()

        Spacer(Modifier.height(32.dp))

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


    SettingHeading("Firmware", "Update the LED board over Bluetooth")
    Spacer(Modifier.height(12.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(
                1.5.dp,
                MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f),
                RoundedCornerShape(16.dp)
            )
            .padding(16.dp)
    ) {
        Text(
            text       = when {
                !isConnected         -> "Board not connected"
                boardVersion != null -> "Board firmware v$boardVersion"
                else                 -> "Board firmware version unknown"
            },
            style      = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color      = MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text  = otaStatusText(state),
            style = MaterialTheme.typography.bodySmall,
            color = if (state is OtaState.Error) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
        )

        if (state.busy || state == OtaState.Checking) {
            Spacer(Modifier.height(12.dp))
            if (state is OtaState.Uploading && state.total > 0) {
                LinearProgressIndicator(
                    progress = { state.sent.toFloat() / state.total },
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        } else {
            Spacer(Modifier.height(12.dp))
            if (state is OtaState.UpdateAvailable) {
                Button(
                    onClick  = { otaManager.startUpdate(state.release) },
                    enabled  = isConnected,
                    shape    = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Update to v${state.release.version}") }
            } else {
                TextButton(
                    onClick  = { otaManager.checkForUpdate(boardVersion) },
                    enabled  = isConnected,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Check for updates") }
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

    SettingHeading("App", "Update this app from GitHub")
    Spacer(Modifier.height(12.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(
                1.5.dp,
                MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f),
                RoundedCornerShape(16.dp)
            )
            .padding(16.dp)
    ) {
        Text(
            text       = "Glow v$installedVersion",
            style      = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color      = MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text  = appUpdateStatusText(state),
            style = MaterialTheme.typography.bodySmall,
            color = if (state is AppUpdateState.Error) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
        )

        Spacer(Modifier.height(12.dp))
        when {
            state is AppUpdateState.Downloading && state.total > 0 -> LinearProgressIndicator(
                progress = { state.read.toFloat() / state.total },
                modifier = Modifier.fillMaxWidth()
            )
            state.busy || state == AppUpdateState.Checking ->
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            state is AppUpdateState.UpdateAvailable -> Button(
                onClick  = { AppUpdater.startUpdate(context, state.release) },
                shape    = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Update to v${state.release.version}") }
            state == AppUpdateState.NeedsPermission -> Button(
                onClick  = {
                    allowInstalls.launch(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${context.packageName}")
                        )
                    )
                },
                shape    = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Allow app updates") }
            else -> TextButton(
                onClick  = { AppUpdater.checkForUpdate(context) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Check for updates") }
        }
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

@Composable
private fun AccentColorPicker(selected: Int, onPick: (Int) -> Unit) {
    SettingHeading("Accent", "Pick a preset or drag for any shade")
    Spacer(Modifier.height(14.dp))

    // Preset swatches
    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        AccentPresets.forEach { c ->
            val argb = c.toArgb()
            val isSel = argb == selected
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(c)
                    .border(
                        width = if (isSel) 3.dp else 1.dp,
                        color = if (isSel) MaterialTheme.colorScheme.onBackground
                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.10f),
                        shape = CircleShape
                    )
                    .bounceClickable(pressedScale = 0.85f) { onPick(argb) })
        }
    }

    Spacer(Modifier.height(20.dp))

    // Custom hue spectrum
    HueSlider(
        selected = Color(selected),
        onPick = { onPick(it.toArgb()) },
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun HueSlider(
    selected: Color, onPick: (Color) -> Unit, modifier: Modifier = Modifier
) {
    var widthPx by remember { mutableIntStateOf(1) }
    val hsv = remember(selected) {
        FloatArray(3).also { AndroidColor.colorToHSV(selected.toArgb(), it) }
    }
    val hue = hsv[0]
    val rainbow = remember {
        listOf(
            Color(0xFFFF0000),
            Color(0xFFFFFF00),
            Color(0xFF00FF00),
            Color(0xFF00FFFF),
            Color(0xFF0000FF),
            Color(0xFFFF00FF),
            Color(0xFFFF0000)
        )
    }

    fun pick(x: Float) {
        val h = (x / widthPx.toFloat()).coerceIn(0f, 1f) * 360f
        val argb = AndroidColor.HSVToColor(floatArrayOf(h, 0.65f, 0.90f))
        onPick(Color(argb))
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(28.dp)
            .clip(RoundedCornerShape(14.dp))
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    pick(down.position.x)
                    down.consume()
                    drag(down.id) { c -> pick(c.position.x); c.consume() }
                }
            }) {
        drawRect(brush = Brush.horizontalGradient(rainbow))
        val r = size.height / 2f
        val tx = (hue / 360f * size.width).coerceIn(r, size.width - r)
        drawCircle(Color.White, radius = r - 2.dp.toPx(), center = Offset(tx, size.height / 2f))
        drawCircle(selected, radius = r - 5.dp.toPx(), center = Offset(tx, size.height / 2f))
    }
}

/** Big title that groups the settings below it. */
@Composable
private fun SettingsCategory(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary
    )
    Spacer(Modifier.height(4.dp))
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f))
    )
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun SettingHeading(title: String, subtitle: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onBackground
    )
    Spacer(Modifier.height(2.dp))
    Text(
        text = subtitle,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
    )
}

@Composable
private fun ChoiceCard(
    label: String,
    description: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val borderColor by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f),
        animationSpec = tween(220),
        label = "choiceBorder"
    )
    val bgColor by animateColorAsState(
        targetValue = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
        else Color.Transparent, animationSpec = tween(220), label = "choiceBg"
    )
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor)
            .border(1.5.dp, borderColor, RoundedCornerShape(16.dp))
            .bounceClickable(pressedScale = 0.96f, onClick = onClick)
            .padding(16.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
        )
    }
}

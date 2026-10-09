package io.github.voidqubex.wifi_fan

import ai.asleep.compose.wheelpicker.WheelPicker
import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothProfile
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
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
    xFrac      = Random.nextFloat(),
    yFrac      = yFrac,
    speedFrac  = Random.nextFloat() * 0.0012f + 0.0003f,
    radiusDp   = Random.nextFloat() * 2.5f + 0.8f,
    alpha      = Random.nextFloat() * 0.055f + 0.018f,
    xDriftFrac = (Random.nextFloat() - 0.5f) * 0.00015f
)

@Composable
fun AmbientParticleBackground(
    modifier: Modifier = Modifier,
    active: Boolean,
    tint: Color
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
                color  = tint.copy(alpha = p.alpha),
                radius = p.radiusDp.dp.toPx(),
                center = Offset(p.xFrac * size.width, p.yFrac * size.height)
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Press feedback — replaces the default Material ripple with a subtle bounce
// ---------------------------------------------------------------------------

/** Scale modifier driven by a button's own [source], for Material buttons. */
@Composable
private fun pressScaleModifier(source: MutableInteractionSource, pressedScale: Float = 0.9f): Modifier {
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue   = if (pressed) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label         = "pressScale"
    )
    return Modifier.scale(scale)
}

/** Clickable with no ripple and a bounce on press — for custom (non-button) elements. */
@Composable
private fun Modifier.bounceClickable(
    enabled: Boolean = true,
    pressedScale: Float = 0.9f,
    onClick: () -> Unit
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue   = if (pressed && enabled) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label         = "bounceClickable"
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = source,
            indication        = null,
            enabled           = enabled,
            onClick           = onClick
        )
}

// ---------------------------------------------------------------------------
// Mode button — flat icon + label + tiny accent dot, no card
// ---------------------------------------------------------------------------

@Composable
private fun ModeButton(
    title: String,
    icon: Int,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val targetAlpha = when {
        !enabled -> 0.18f
        selected -> 0.88f
        else     -> 0.32f
    }
    val iconAlpha by animateFloatAsState(targetAlpha, tween(220), label = "modeAlpha")
    val dotAlpha  by animateFloatAsState(
        if (selected && enabled) 1f else 0f, tween(220), label = "modeDot"
    )
    val primary = MaterialTheme.colorScheme.primary
    val onBg    = MaterialTheme.colorScheme.onBackground

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .bounceClickable(enabled = enabled, pressedScale = 0.88f, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Box(
            modifier         = Modifier.size(40.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter           = painterResource(icon),
                contentDescription = title,
                modifier          = Modifier.size(22.dp),
                tint              = onBg.copy(alpha = iconAlpha)
            )
        }
        Text(
            text     = title,
            style    = MaterialTheme.typography.labelSmall,
            fontSize = 10.sp,
            color    = onBg.copy(alpha = iconAlpha * 0.85f)
        )
        Spacer(Modifier.height(5.dp))
        // Tiny accent dot under selected mode
        Box(
            modifier = Modifier
                .size(4.dp)
                .clip(CircleShape)
                .background(primary.copy(alpha = dotAlpha))
        )
    }
}

// ---------------------------------------------------------------------------
// Morphing slider — a thin hairline at rest that grows a thumb + thicker
// track while the user is interacting. Snaps to whole steps (minValue..maxValue).
// ---------------------------------------------------------------------------

@Composable
private fun MorphingSlider(
    value: Float,
    onValueChange: (Int) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    mono: Boolean = false,
    minValue: Int = 1,
    maxValue: Int = 6
) {
    var active   by remember { mutableStateOf(false) }
    var widthPx  by remember { mutableIntStateOf(1) }
    val isActive = active && enabled

    val trackHeight by animateFloatAsState(
        targetValue   = if (isActive) 6f else 2f,
        animationSpec = tween(220),
        label         = "trackHeight"
    )
    val thumbRadius by animateFloatAsState(
        targetValue   = if (isActive) 11f else 0f,
        animationSpec = tween(220),
        label         = "thumbRadius"
    )
    val overallAlpha by animateFloatAsState(
        targetValue   = if (enabled) 1f else 0.4f,
        animationSpec = tween(220),
        label         = "sliderAlpha"
    )

    val primary = MaterialTheme.colorScheme.primary
    val onBg    = MaterialTheme.colorScheme.onBackground
    // In monochrome the fill stays neutral and the accent only rims the thumb.
    val fillColor = if (mono) onBg else primary

    fun valueFromX(x: Float): Int {
        val frac = (x / widthPx.toFloat()).coerceIn(0f, 1f)
        return (minValue + frac * (maxValue - minValue)).roundToInt()
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                // Single gesture: down → active, drag → follow, up → rest.
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    active = true
                    onValueChange(valueFromX(down.position.x))
                    down.consume()
                    drag(down.id) { change ->
                        onValueChange(valueFromX(change.position.x))
                        change.consume()
                    }
                    active = false
                }
            }
    ) {
        val cy     = size.height / 2f
        val frac   = ((value - minValue) / (maxValue - minValue)).coerceIn(0f, 1f)
        val thumbX = frac * size.width
        val th     = trackHeight.dp.toPx()

        // Inactive track
        drawLine(
            color       = onBg.copy(alpha = 0.12f * overallAlpha),
            start       = Offset(0f, cy),
            end         = Offset(size.width, cy),
            strokeWidth = th,
            cap         = StrokeCap.Round
        )
        // Active (filled) track
        drawLine(
            color       = fillColor.copy(alpha = overallAlpha),
            start       = Offset(0f, cy),
            end         = Offset(thumbX.coerceAtLeast(0.01f), cy),
            strokeWidth = th,
            cap         = StrokeCap.Round
        )
        // Thumb — grows in only while interacting
        val r = thumbRadius.dp.toPx()
        if (r > 0f) {
            drawCircle(
                color  = fillColor.copy(alpha = overallAlpha),
                radius = r,
                center = Offset(thumbX, cy)
            )
            // Accent rim — the lone splash of color in monochrome mode
            if (mono) {
                drawCircle(
                    color  = primary.copy(alpha = overallAlpha),
                    radius = r,
                    center = Offset(thumbX, cy),
                    style  = Stroke(width = 2.dp.toPx())
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Power button — filled accent in Colored mode; neutral fill + accent ring
// in Monochrome mode. Custom press-scale, no ripple.
// ---------------------------------------------------------------------------

@Composable
private fun PowerButton(
    isPowerOn: Boolean,
    mono: Boolean,
    onClick: () -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val container by animateColorAsState(
        targetValue   = when {
            mono && isPowerOn -> cs.onBackground
            isPowerOn         -> cs.primary
            else              -> cs.surfaceVariant
        },
        animationSpec = tween(280),
        label         = "powerBg"
    )
    val content by animateColorAsState(
        targetValue   = when {
            mono && isPowerOn -> cs.background
            isPowerOn         -> cs.onPrimary
            else              -> cs.onSurfaceVariant
        },
        animationSpec = tween(280),
        label         = "powerFg"
    )
    val border by animateColorAsState(
        targetValue   = when {
            mono && isPowerOn -> cs.primary
            mono              -> cs.onBackground.copy(alpha = 0.14f)
            else              -> Color.Transparent
        },
        animationSpec = tween(280),
        label         = "powerBorder"
    )
    val source = remember { MutableInteractionSource() }
    FilledIconButton(
        onClick           = onClick,
        interactionSource = source,
        modifier          = pressScaleModifier(source)
            .size(56.dp)
            .border(1.5.dp, border, CircleShape),
        shape             = CircleShape,
        colors            = IconButtonDefaults.filledIconButtonColors(
            containerColor = container,
            contentColor   = content
        )
    ) {
        Icon(
            painter            = painterResource(R.drawable.power),
            contentDescription = "Power",
            modifier           = Modifier.size(28.dp)
        )
    }
}

// ---------------------------------------------------------------------------
// Color picker — saturation/value square + hue bar
// ---------------------------------------------------------------------------

@Composable
private fun ColorPicker(
    hue: Float,
    sat: Float,
    value: Float,
    onChange: (hue: Float, sat: Float, value: Float) -> Unit
) {
    val onSurface = MaterialTheme.colorScheme.onSurface

    // Saturation (x) / value (y) square
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(14.dp))
            .pointerInput(hue) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fun report(p: Offset) = onChange(
                        hue,
                        (p.x / size.width).coerceIn(0f, 1f),
                        1f - (p.y / size.height).coerceIn(0f, 1f)
                    )
                    report(down.position)
                    down.consume()
                    drag(down.id) { change -> report(change.position); change.consume() }
                }
            }
    ) {
        val hueColor = Color(AndroidColor.HSVToColor(floatArrayOf(hue, 1f, 1f)))
        drawRect(Brush.horizontalGradient(listOf(Color.White, hueColor)))
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
        val c = Offset(sat * size.width, (1f - value) * size.height)
        drawCircle(Color.Black.copy(alpha = 0.35f), radius = 13.dp.toPx(), center = c)
        drawCircle(Color.White, radius = 11.dp.toPx(), center = c)
        drawCircle(
            Color(AndroidColor.HSVToColor(floatArrayOf(hue, sat, value))),
            radius = 8.dp.toPx(), center = c
        )
    }

    Spacer(Modifier.height(16.dp))

    // Hue bar
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
            .pointerInput(sat, value) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fun report(p: Offset) =
                        onChange((p.x / size.width).coerceIn(0f, 1f) * 360f, sat, value)
                    report(down.position)
                    down.consume()
                    drag(down.id) { change -> report(change.position); change.consume() }
                }
            }
    ) {
        val barH = 14.dp.toPx()
        val top  = (size.height - barH) / 2f
        val stops = (0..6).map { Color(AndroidColor.HSVToColor(floatArrayOf(it * 60f, 1f, 1f))) }
        drawRoundRect(
            brush        = Brush.horizontalGradient(stops),
            topLeft      = Offset(0f, top),
            size         = androidx.compose.ui.geometry.Size(size.width, barH),
            cornerRadius = CornerRadius(barH / 2f)
        )
        val x = hue / 360f * size.width
        val tc = Offset(x, size.height / 2f)
        drawCircle(Color.Black.copy(alpha = 0.3f), radius = 13.dp.toPx(), center = tc)
        drawCircle(Color.White, radius = 11.dp.toPx(), center = tc)
        drawCircle(
            Color(AndroidColor.HSVToColor(floatArrayOf(hue, 1f, 1f))),
            radius = 8.dp.toPx(), center = tc
        )
    }
}

private val LedPresets = listOf(
    0xFFFFFFFF.toInt(), 0xFFFF3B30.toInt(), 0xFFFF9500.toInt(), 0xFFFFD60A.toInt(),
    0xFF34C759.toInt(), 0xFF00C7BE.toInt(), 0xFF0A84FF.toInt(), 0xFFBF5AF2.toInt(),
    0xFFFF2D92.toInt()
)

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
class MainActivity : ComponentActivity() {
    private lateinit var bleManager: BleManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bleManager = BleManager(this)
        val settingsStore = SettingsStore(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        enableEdgeToEdge()
        setContent {
            var uiLayout    by remember { mutableStateOf(settingsStore.uiLayout) }
            var colorScheme by remember { mutableStateOf(settingsStore.colorScheme) }
            var accentColor by remember { mutableIntStateOf(settingsStore.accentColor) }
            var background  by remember { mutableStateOf(settingsStore.background) }

            WiFiFanTheme(
                colored = colorScheme == AppColorScheme.COLORED,
                accent  = Color(accentColor)
            ) {
                Scaffold(modifier = Modifier.fillMaxSize()) { _ ->
                    BleControlScreen(
                        bleManager         = bleManager,
                        uiLayout           = uiLayout,
                        colorScheme        = colorScheme,
                        accentColor        = accentColor,
                        background         = background,
                        onLayoutChange     = { uiLayout = it; settingsStore.uiLayout = it },
                        onColorChange      = { colorScheme = it; settingsStore.colorScheme = it },
                        onAccentChange     = { accentColor = it; settingsStore.accentColor = it },
                        onBackgroundChange = { background = it; settingsStore.background = it }
                    )
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
        const val TURBO: String       = "turbo"
        const val ECO: String         = "eco"
        const val NATURE_WIND: String = "nature_wind"
        const val POWER_ON: String    = "on"
        const val POWER_OFF: String   = "off"
        const val SPEED: String       = "s="
        const val TIMER: String       = "t="
        const val SLEEP: String       = "sleep"
        const val LED: String         = "l="
    }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

@SuppressLint("ObsoleteSdkInt", "MissingPermission", "UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun BleControlScreen(
    bleManager: BleManager,
    uiLayout: UiLayout,
    colorScheme: AppColorScheme,
    accentColor: Int,
    background: AppBackground,
    onLayoutChange: (UiLayout) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val isDark  = isSystemInDarkTheme()
    val mono    = colorScheme == AppColorScheme.MONOCHROME

    // For the frosted Simple panel: a blurred full-screen copy of the wallpaper is
    // drawn at the root and clipped to the panel's rectangle (captured here).
    var panelPos  by remember { mutableStateOf(Offset.Zero) }
    var panelSize by remember { mutableStateOf(IntSize.Zero) }

    SideEffect {
        (context as? Activity)?.window?.let { window ->
            WindowInsetsControllerCompat(window, window.decorView).apply {
                isAppearanceLightStatusBars     = !isDark
                isAppearanceLightNavigationBars = !isDark
            }
        }
    }

    var showSettings     by remember { mutableStateOf(false) }
    var showDeviceDialog by remember { mutableStateOf(false) }
    var speed            by remember { mutableFloatStateOf(1f) }
    var isTurbo          by remember { mutableStateOf(false) }
    var isEco            by remember { mutableStateOf(false) }
    var isNatureWind     by remember { mutableStateOf(false) }
    var isSleep          by remember { mutableStateOf(false) }
    var isPowerOn        by remember { mutableStateOf(false) }
    var currentTimer     by remember { mutableIntStateOf(0) }
    var angle            by remember { mutableFloatStateOf(0f) }
    var windPhase        by remember { mutableFloatStateOf(0f) }
    var showTimerDialog  by remember { mutableStateOf(false) }
    var showLedDialog    by remember { mutableStateOf(false) }
    var ledColor         by remember { mutableIntStateOf(AndroidColor.WHITE) }

    val connectionState by bleManager.connectionState.collectAsState()
    val foundDevices    by bleManager.foundDevices.collectAsState()
    val isScanning      by bleManager.isScanning.collectAsState()

    val isConnected = connectionState == BluetoothProfile.STATE_CONNECTED
    val controlsEnabled = isConnected && isPowerOn

    val effectiveSpeed by remember {
        derivedStateOf {
            when {
                isTurbo      -> 7f
                isEco        -> 4f
                isNatureWind -> (1.5f + 1.5f * windPhase).coerceIn(1f, 3f)
                else         -> speed
            }
        }
    }

    LaunchedEffect(isPowerOn) {
        if (isPowerOn) {
            var lastTime = withFrameNanos { it }
            while (true) {
                val now = withFrameNanos { it }
                val dt  = (now - lastTime) / 1_000_000f
                angle     = (angle + effectiveSpeed * dt * 0.1f) % 360f
                windPhase = sin(now.toDouble() / 7_000_000_00.0).toFloat()
                lastTime  = now
            }
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
    // Device dialog
    // -----------------------------------------------------------------------

    if (showDeviceDialog) {
        AlertDialog(
            onDismissRequest = { bleManager.stopScanning(); showDeviceDialog = false },
            title   = { Text("Select Device") },
            text    = {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (isScanning) {
                        CircularProgressIndicator(strokeCap = StrokeCap.Round)
                        Spacer(Modifier.height(8.dp))
                        Text("Scanning…")
                    }
                    LazyColumn(Modifier.heightIn(max = 300.dp)) {
                        items(foundDevices.toList()) { device ->
                            ListItem(
                                headlineContent   = { Text(device.name ?: "Unknown Device") },
                                supportingContent = { Text(device.address) },
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .bounceClickable(pressedScale = 0.97f) {
                                        bleManager.stopScanning()
                                        showDeviceDialog = false
                                        bleManager.connect(device.address)
                                    },
                                colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                val cancelSrc = remember { MutableInteractionSource() }
                TextButton(
                    onClick           = { bleManager.stopScanning(); showDeviceDialog = false },
                    interactionSource = cancelSrc,
                    modifier          = pressScaleModifier(cancelSrc)
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    // -----------------------------------------------------------------------
    // Timer dialog
    // -----------------------------------------------------------------------

    if (showTimerDialog) {
        var selectedTime by remember { mutableStateOf(LocalTime.of(currentTimer, 0)) }

        Dialog(onDismissRequest = { showTimerDialog = false }) {
            Card(
                shape    = RoundedCornerShape(28.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        1.dp,
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.3f),
                        RoundedCornerShape(28.dp)
                    )
            ) {
                Column(
                    Modifier.padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Timer",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Power off after",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
                    )
                    Spacer(Modifier.height(28.dp))

                    val hourOptions   = remember { (0..4).map { "%02d".format(it) } }
                    val minuteOptions = remember { (0..59).map { "%02d".format(it) } }
                    var selectedHour   by remember { mutableIntStateOf(selectedTime.hour.coerceIn(0, 3)) }
                    var selectedMinute by remember { mutableIntStateOf((selectedTime.minute / 5) * 5) }

                    Box(
                        contentAlignment = Alignment.Center,
                        modifier         = Modifier.fillMaxWidth().height(140.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .width(200.dp)
                                .height(44.dp)
                                .border(
                                    1.dp,
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
                                    RoundedCornerShape(12.dp)
                                )
                        )
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment     = Alignment.CenterVertically
                        ) {
                            WheelPicker(
                                items            = hourOptions,
                                initialIndex     = selectedHour,
                                onValueChange    = { _, v ->
                                    selectedHour = v.toInt()
                                    selectedTime = LocalTime.of(selectedHour, selectedMinute)
                                },
                                modifier         = Modifier.width(80.dp),
                                visibleItemCount = 3,
                                peekItemCount    = 1,
                                itemHeight       = 36.dp,
                                repeatable       = false,
                                cylindrical      = true,
                                fadeEdges        = true,
                                textStyle        = MaterialTheme.typography.headlineMedium,
                                textColor        = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                ":",
                                color    = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                                fontSize = 28.sp,
                                modifier = Modifier.padding(horizontal = 8.dp)
                            )
                            WheelPicker(
                                items            = minuteOptions,
                                initialIndex     = minuteOptions.indexOf("%02d".format(selectedMinute)),
                                onValueChange    = { _, v ->
                                    selectedMinute = v.toInt()
                                    selectedTime   = LocalTime.of(selectedHour, selectedMinute)
                                },
                                modifier         = Modifier.width(80.dp),
                                visibleItemCount = 3,
                                peekItemCount    = 1,
                                itemHeight       = 36.dp,
                                repeatable       = false,
                                cylindrical      = true,
                                fadeEdges        = true,
                                textStyle        = MaterialTheme.typography.headlineMedium,
                                textColor        = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }

                    Spacer(Modifier.height(24.dp))

                    val setSrc = remember { MutableInteractionSource() }
                    Button(
                        onClick  = {
                            val total = selectedTime.hour * 60 + selectedTime.minute
                            bleManager.sendData(Commands.TIMER + total)
                            currentTimer    = selectedTime.hour
                            showTimerDialog = false
                        },
                        shape             = RoundedCornerShape(14.dp),
                        interactionSource = setSrc,
                        modifier          = pressScaleModifier(setSrc).fillMaxWidth()
                    ) { Text("Set Timer") }

                    Spacer(Modifier.height(4.dp))

                    val offSrc = remember { MutableInteractionSource() }
                    TextButton(
                        onClick  = {
                            bleManager.sendData(Commands.TIMER + 0)
                            currentTimer    = 0
                            showTimerDialog = false
                        },
                        interactionSource = offSrc,
                        modifier          = pressScaleModifier(offSrc).fillMaxWidth()
                    ) { Text("Turn Off") }
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // RGB LED dialog
    // -----------------------------------------------------------------------

    if (showLedDialog) {
        val initHsv = remember {
            FloatArray(3).also { AndroidColor.colorToHSV(ledColor, it) }
        }
        var hue by remember { mutableFloatStateOf(initHsv[0]) }
        var sat by remember { mutableFloatStateOf(initHsv[1]) }
        var bri by remember { mutableFloatStateOf(initHsv[2]) }
        val picked = AndroidColor.HSVToColor(floatArrayOf(hue, sat, bri))

        Dialog(onDismissRequest = { showLedDialog = false }) {
            Card(
                shape    = RoundedCornerShape(28.dp),
                colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        1.dp,
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.3f),
                        RoundedCornerShape(28.dp)
                    )
            ) {
                Column(
                    Modifier.padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "LED",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Pick a color",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
                    )
                    Spacer(Modifier.height(20.dp))

                    // Live preview: glowing orb + hex code
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(96.dp)) {
                        Canvas(Modifier.fillMaxSize()) {
                            drawCircle(
                                Brush.radialGradient(
                                    listOf(Color(picked).copy(alpha = 0.55f), Color.Transparent)
                                )
                            )
                            drawCircle(Color(picked), radius = 30.dp.toPx())
                            drawCircle(
                                Color.White.copy(alpha = 0.25f),
                                radius = 30.dp.toPx(), style = Stroke(2.dp.toPx())
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "#%02X%02X%02X".format(
                            AndroidColor.red(picked), AndroidColor.green(picked), AndroidColor.blue(picked)
                        ),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                    )

                    Spacer(Modifier.height(20.dp))

                    ColorPicker(
                        hue = hue, sat = sat, value = bri,
                        onChange = { h, s, v -> hue = h; sat = s; bri = v }
                    )

                    Spacer(Modifier.height(16.dp))

                    // Preset swatches
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        LedPresets.forEach { preset ->
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(Color(preset))
                                    .border(
                                        1.dp,
                                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f),
                                        CircleShape
                                    )
                                    .clickable {
                                        val hsv = FloatArray(3)
                                        AndroidColor.colorToHSV(preset, hsv)
                                        hue = hsv[0]; sat = hsv[1]; bri = hsv[2]
                                    }
                            )
                        }
                    }

                    Spacer(Modifier.height(24.dp))

                    val ledSetSrc = remember { MutableInteractionSource() }
                    Button(
                        onClick  = {
                            bleManager.sendData(
                                Commands.LED +
                                    "${AndroidColor.red(picked)}/${AndroidColor.green(picked)}/${AndroidColor.blue(picked)}"
                            )
                            ledColor      = picked
                            showLedDialog = false
                        },
                        shape             = RoundedCornerShape(14.dp),
                        interactionSource = ledSetSrc,
                        modifier          = pressScaleModifier(ledSetSrc).fillMaxWidth()
                    ) { Text("Set Color") }

                    Spacer(Modifier.height(4.dp))

                    val ledOffSrc = remember { MutableInteractionSource() }
                    TextButton(
                        onClick  = {
                            bleManager.sendData(Commands.LED + "0/0/0")
                            ledColor      = AndroidColor.BLACK
                            showLedDialog = false
                        },
                        interactionSource = ledOffSrc,
                        modifier          = pressScaleModifier(ledOffSrc).fillMaxWidth()
                    ) { Text("Turn Off") }
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Root
    // -----------------------------------------------------------------------

    Scaffold { _ ->
        Box(modifier = modifier.fillMaxSize()) {

            // ── Backdrop ────────────────────────────────────────────────
            when (background) {
                AppBackground.IMAGE -> Image(
                    painter            = painterResource(R.drawable.background),
                    contentDescription = null,
                    contentScale       = ContentScale.Crop,
                    modifier           = Modifier.fillMaxSize()
                )
                AppBackground.SIMPLE -> AmbientParticleBackground(
                    modifier = Modifier.fillMaxSize(),
                    active   = isPowerOn,
                    tint     = MaterialTheme.colorScheme.onBackground
                )
            }

            // ── Real backdrop blur for the frosted control panel ────────
            // A blurred full-screen copy of the wallpaper, clipped to the panel's
            // rounded rect. It fills the exact same bounds as the sharp copy above,
            // so it lines up perfectly — then the panel's translucent tint sits on top.
            // Both the Simple and Classic layouts park a panel at the bottom and
            // report its bounds via panelPos/panelSize, so this works for either.
            if (background == AppBackground.IMAGE &&
                isConnected &&
                !showSettings &&
                panelSize != IntSize.Zero
            ) {
                Image(
                    painter            = painterResource(R.drawable.background),
                    contentDescription = null,
                    contentScale       = ContentScale.Crop,
                    modifier           = Modifier
                        .fillMaxSize()
                        .drawWithContent {
                            val content = this
                            val corner  = 28.dp.toPx()
                            val path = Path().apply {
                                addRoundRect(
                                    RoundRect(
                                        left   = panelPos.x,
                                        top    = panelPos.y,
                                        right  = panelPos.x + panelSize.width,
                                        bottom = panelPos.y + panelSize.height,
                                        topLeftCornerRadius     = CornerRadius(corner, corner),
                                        topRightCornerRadius    = CornerRadius(corner, corner),
                                        bottomRightCornerRadius = CornerRadius.Zero,
                                        bottomLeftCornerRadius  = CornerRadius.Zero
                                    )
                                )
                            }
                            clipPath(path) { content.drawContent() }
                        }
                        .blur(14.dp)
                )
            }

            // ── Darkening scrim ─────────────────────────────────────────
            // Dims the wallpaper a touch for legibility. Sits above both the
            // sharp backdrop and the panel's blurred copy, so the frosted
            // panel dims by the same amount as everything around it.
            if (background == AppBackground.IMAGE) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.22f))
                )
            }

            // Settings page slides in over the control screen
            AnimatedContent(
                targetState    = showSettings,
                transitionSpec = { fadeIn(tween(300)).togetherWith(fadeOut(tween(300))) },
                label          = "settingsTransition",
                modifier       = Modifier.fillMaxSize()
            ) { inSettings ->
              if (inSettings) {
                SettingsScreen(
                    uiLayout           = uiLayout,
                    colorScheme        = colorScheme,
                    accentColor        = accentColor,
                    background         = background,
                    onLayoutChange     = onLayoutChange,
                    onColorChange      = onColorChange,
                    onAccentChange     = onAccentChange,
                    onBackgroundChange = onBackgroundChange,
                    onBack             = { showSettings = false }
                )
              } else {

              // Entire UI transitions when connection state flips
              AnimatedContent(
                targetState    = isConnected,
                transitionSpec = { fadeIn(tween(450)).togetherWith(fadeOut(tween(450))) },
                label          = "connectionTransition",
                modifier       = Modifier.fillMaxSize()
              ) { connected ->

                val connectionLabel = when (connectionState) {
                    BluetoothProfile.STATE_CONNECTED     -> "Connected"
                    BluetoothProfile.STATE_CONNECTING    -> "Connecting…"
                    BluetoothProfile.STATE_DISCONNECTING -> "Disconnecting…"
                    else                                 -> "Disconnected"
                }

                if (connected) {
                    // =====================================================
                    // CONNECTED LAYOUT
                    // =====================================================
                    Column(
                        modifier            = Modifier
                            .fillMaxSize()
                            .statusBarsPadding(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {

                        // ── Header ─────────────────────────────────────
                        Row(
                            modifier            = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 24.dp, vertical = 14.dp),
                            verticalAlignment   = Alignment.CenterVertically
                        ) {
                            Text(
                                text        = "WiFi Fan",
                                style       = MaterialTheme.typography.labelLarge,
                                color       = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f),
                                letterSpacing = 2.sp,
                                modifier    = Modifier.weight(1f)
                            )

                            // Connection dot + label — tap to disconnect
                            val dotColor by animateColorAsState(
                                targetValue = MaterialTheme.colorScheme.primary,
                                animationSpec = tween(600),
                                label = "connDot"
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier          = Modifier
                                    .clip(RoundedCornerShape(20.dp))
                                    .bounceClickable { bleManager.disconnect() }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(dotColor)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    connectionLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f)
                                )
                            }

                            // Settings gear
                            Box(
                                modifier         = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .bounceClickable { showSettings = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    painter            = painterResource(R.drawable.settings),
                                    contentDescription = "Settings",
                                    modifier           = Modifier.size(20.dp),
                                    tint               = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f)
                                )
                            }
                        }

                      if (uiLayout == UiLayout.SIMPLE) {
                        // ===================================================
                        // SIMPLE BODY — fan + frosted-glass control panel
                        // ===================================================
                        // ── Fan image ──────────────────────────────────
                        val fanAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 1f else 0.28f,
                            animationSpec = tween(400),
                            label         = "fanAlpha"
                        )
                        val glowColor = MaterialTheme.colorScheme.onBackground

                        Box(
                            modifier         = Modifier.fillMaxWidth().weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            // Soft radial glow behind fan — adds perceived depth
                            Canvas(Modifier.size(320.dp)) {
                                drawCircle(
                                    brush = Brush.radialGradient(
                                        colors = listOf(
                                            glowColor.copy(alpha = 0.07f),
                                            Color.Transparent
                                        ),
                                        radius = 160.dp.toPx()
                                    ),
                                    radius = 160.dp.toPx()
                                )
                            }
                            Image(
                                painter            = painterResource(R.drawable.fan2),
                                contentDescription = "Fan",
                                contentScale       = ContentScale.Fit,
                                modifier           = Modifier
                                    .size(320.dp)
                                    .rotate(angle)
                                    .alpha(fanAlpha)
                            )
                        }

                        // ── Controls panel ──────────────────────────────
                        val modeLabel = when {
                            isTurbo      -> "TURBO"
                            isEco        -> "ECO"
                            isNatureWind -> "NATURE"
                            isSleep      -> "SLEEP"
                            else         -> "SPEED"
                        }
                        val numberAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 0.88f else 0.22f,
                            animationSpec = tween(350),
                            label         = "numberAlpha"
                        )
                        val labelAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 0.4f else 0.18f,
                            animationSpec = tween(350),
                            label         = "labelAlpha"
                        )
                        val primary = MaterialTheme.colorScheme.primary
                        val onBg    = MaterialTheme.colorScheme.onBackground

                        // Frosted glass panel — translucent tint; the real backdrop
                        // blur is drawn at the root and clipped to this panel's rect.
                        val panelShape  = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
                        val glassTint   = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f)
                        val glassBorder = if (isDark) Color.White.copy(alpha = 0.16f)
                                          else Color.White.copy(alpha = 0.42f)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .onGloballyPositioned {
                                    panelPos  = it.positionInRoot()
                                    panelSize = it.size
                                }
                                .clip(panelShape)
                                .border(1.dp, glassBorder, panelShape)
                        ) {
                            Column(
                                modifier            = Modifier
                                    .fillMaxWidth()
                                    .background(glassTint)
                                    .padding(horizontal = 24.dp)
                                    .padding(top = 22.dp)
                                    .navigationBarsPadding(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                            // Speed number
                            AnimatedContent(
                                targetState    = speed.toInt(),
                                transitionSpec = {
                                    val sign = if (targetState > initialState) -1 else 1
                                    (
                                        slideInVertically(tween(180)) { (it * 0.45f * sign).toInt() } +
                                        fadeIn(tween(180))
                                    ).togetherWith(
                                        slideOutVertically(tween(160)) { (-it * 0.45f * sign).toInt() } +
                                        fadeOut(tween(130))
                                    )
                                },
                                label = "speedNumber"
                            ) { spd ->
                                Text(
                                    text       = "$spd",
                                    fontSize   = 72.sp,
                                    fontWeight = FontWeight.Thin,
                                    color      = onBg.copy(alpha = numberAlpha),
                                    lineHeight = 72.sp
                                )
                            }

                            Spacer(Modifier.height(2.dp))

                            Text(
                                text          = modeLabel,
                                style         = MaterialTheme.typography.labelSmall,
                                color         = onBg.copy(alpha = labelAlpha),
                                letterSpacing = 2.sp,
                                fontSize      = 10.sp
                            )

                            Spacer(Modifier.height(12.dp))

                            // Speed slider — thin line that morphs into a full
                            // slider while dragging. 1..6; 7 is Turbo-only.
                            MorphingSlider(
                                value         = speed.coerceIn(1f, 6f),
                                enabled       = controlsEnabled,
                                mono          = mono,
                                onValueChange = { v ->
                                    speed = v.toFloat()
                                    bleManager.sendData(Commands.SPEED + v)
                                    isTurbo = false; isEco = false
                                    isNatureWind = false; isSleep = false
                                },
                                modifier      = Modifier.fillMaxWidth()
                            )

                            Spacer(Modifier.height(4.dp))

                            // ── Mode row ───────────────────────────────
                            Row(
                                modifier              = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                ModeButton(
                                    title    = "Turbo",
                                    icon     = R.drawable.turbo,
                                    selected = isTurbo,
                                    enabled  = controlsEnabled,
                                    onClick  = {
                                        bleManager.sendData(Commands.TURBO)
                                        isEco = false; isSleep = false; isNatureWind = false
                                        isTurbo = true; speed = 7f
                                    }
                                )
                                ModeButton(
                                    title    = "Eco",
                                    icon     = R.drawable.eco,
                                    selected = isEco,
                                    enabled  = controlsEnabled,
                                    onClick  = {
                                        bleManager.sendData(Commands.ECO)
                                        isTurbo = false; isSleep = false; isNatureWind = false
                                        isEco = true; speed = 4f
                                    }
                                )
                                ModeButton(
                                    title    = "Nature",
                                    icon     = R.drawable.nature_wind,
                                    selected = isNatureWind,
                                    enabled  = controlsEnabled,
                                    onClick  = {
                                        bleManager.sendData(Commands.NATURE_WIND)
                                        isTurbo = false; isEco = false; isSleep = false
                                        isNatureWind = true
                                    }
                                )
                                ModeButton(
                                    title    = "Sleep",
                                    icon     = R.drawable.sleep,
                                    selected = isSleep,
                                    enabled  = controlsEnabled,
                                    onClick  = {
                                        bleManager.sendData(Commands.SLEEP)
                                        isTurbo = false; isEco = false; isNatureWind = false
                                        isSleep = true; speed = 1f
                                    }
                                )
                            }

                            Spacer(Modifier.height(12.dp))

                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(0.5.dp)
                                    .background(onBg.copy(alpha = 0.08f))
                            )

                            // ── Bottom row: Timer + Power ───────────────
                            Row(
                                modifier              = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment     = Alignment.CenterVertically
                            ) {
                                val timerSrc = remember { MutableInteractionSource() }
                                TextButton(
                                    onClick           = { showTimerDialog = true },
                                    enabled           = isPowerOn,
                                    interactionSource = timerSrc,
                                    modifier          = pressScaleModifier(timerSrc)
                                ) {
                                    Icon(
                                        painter            = painterResource(R.drawable.timer),
                                        contentDescription = "Timer",
                                        modifier           = Modifier.size(16.dp),
                                        tint               = MaterialTheme.colorScheme.onSurface.copy(
                                            alpha = if (isPowerOn) 0.55f else 0.2f
                                        )
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text  = if (currentTimer > 0) "Timer  ${currentTimer}h" else "Timer",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurface.copy(
                                            alpha = if (isPowerOn) 0.55f else 0.2f
                                        )
                                    )
                                }

                                val ledSrc = remember { MutableInteractionSource() }
                                TextButton(
                                    onClick           = { showLedDialog = true },
                                    enabled           = isPowerOn,
                                    interactionSource = ledSrc,
                                    modifier          = pressScaleModifier(ledSrc)
                                ) {
                                    Icon(
                                        painter            = painterResource(R.drawable.led),
                                        contentDescription = "LED",
                                        modifier           = Modifier.size(16.dp),
                                        tint               = MaterialTheme.colorScheme.onSurface.copy(
                                            alpha = if (isPowerOn) 0.55f else 0.2f
                                        )
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text  = "LED",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurface.copy(
                                            alpha = if (isPowerOn) 0.55f else 0.2f
                                        )
                                    )
                                }

                                PowerButton(
                                    isPowerOn = isPowerOn,
                                    mono      = mono,
                                    onClick   = {
                                        if (isPowerOn) {
                                            bleManager.sendData(Commands.POWER_OFF)
                                            isPowerOn    = false
                                            isTurbo      = false
                                            isEco        = false
                                            isNatureWind = false
                                            isSleep      = false
                                        } else {
                                            bleManager.sendData(Commands.POWER_ON)
                                            isPowerOn = true
                                        }
                                    }
                                )
                            }
                            }
                        }
                      } else {
                        // ===================================================
                        // CLASSIC BODY — circular dial + mode cards
                        // ===================================================
                        val classicModeLabel = when {
                            isTurbo      -> "TURBO"
                            isEco        -> "ECO"
                            isNatureWind -> "NATURE"
                            isSleep      -> "SLEEP"
                            else         -> "SPEED"
                        }
                        val classicFanAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 1f else 0.3f,
                            animationSpec = tween(400),
                            label         = "classicFanAlpha"
                        )
                        val cNumberAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 0.88f else 0.22f,
                            animationSpec = tween(350),
                            label         = "cNumberAlpha"
                        )
                        val cLabelAlpha by animateFloatAsState(
                            targetValue   = if (isPowerOn) 0.4f else 0.18f,
                            animationSpec = tween(350),
                            label         = "cLabelAlpha"
                        )
                        val density   = LocalDensity.current
                        val radiusPx  = with(density) { 124.dp.toPx() }
                        val cPrimary  = MaterialTheme.colorScheme.primary
                        val cOnBg     = MaterialTheme.colorScheme.onBackground
                        // Translucent neutral track so the dial reads as glass over
                        // the wallpaper instead of a flat, opaque ring.
                        val cTrack    = cOnBg.copy(alpha = 0.15f)

                        Box(
                            modifier         = Modifier.fillMaxWidth().weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            // Soft radial glow for depth
                            Canvas(Modifier.size(330.dp)) {
                                drawCircle(
                                    brush = Brush.radialGradient(
                                        colors = listOf(cOnBg.copy(alpha = 0.07f), Color.Transparent),
                                        radius = 165.dp.toPx()
                                    ),
                                    radius = 165.dp.toPx()
                                )
                            }

                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                // Dial — fan sits inside the ring
                                Box(
                                    modifier         = Modifier.size(290.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularSlider(
                                        modifier        = Modifier.fillMaxSize(),
                                        value           = speed.toInt().coerceIn(1, 6),
                                        primaryColor    = cPrimary,
                                        secondaryColor  = cTrack,
                                        minValue        = 1,
                                        maxValue        = 6,
                                        circleRadius    = radiusPx,
                                        disabled        = !controlsEnabled,
                                        onPositionChange = { v ->
                                            speed = v.toFloat()
                                            bleManager.sendData(Commands.SPEED + v)
                                            isTurbo = false; isEco = false
                                            isNatureWind = false; isSleep = false
                                        }
                                    )
                                    Image(
                                        painter            = painterResource(R.drawable.fan2),
                                        contentDescription = "Fan",
                                        contentScale       = ContentScale.Fit,
                                        modifier           = Modifier
                                            .size(270.dp)
                                            .rotate(angle)
                                            .alpha(classicFanAlpha)
                                    )
                                }

                                Spacer(Modifier.height(16.dp))

                                // Speed read-out below the dial — odometer style
                                AnimatedContent(
                                    targetState    = speed.toInt(),
                                    transitionSpec = {
                                        val sign = if (targetState > initialState) -1 else 1
                                        (
                                            slideInVertically(tween(180)) { (it * 0.45f * sign).toInt() } +
                                            fadeIn(tween(180))
                                        ).togetherWith(
                                            slideOutVertically(tween(160)) { (-it * 0.45f * sign).toInt() } +
                                            fadeOut(tween(130))
                                        )
                                    },
                                    label = "cSpeedNumber"
                                ) { spd ->
                                    Text(
                                        text       = "$spd",
                                        fontSize   = 56.sp,
                                        fontWeight = FontWeight.Thin,
                                        color      = cOnBg.copy(alpha = cNumberAlpha),
                                        lineHeight = 56.sp
                                    )
                                }

                                Text(
                                    text          = classicModeLabel,
                                    style         = MaterialTheme.typography.labelSmall,
                                    color         = cOnBg.copy(alpha = cLabelAlpha),
                                    letterSpacing = 2.sp,
                                    fontSize      = 10.sp
                                )
                            }
                        }

                        // ── Controls panel — frosted glass, same as Simple ──
                        // A translucent panel parked at the bottom; its bounds
                        // (captured via onGloballyPositioned) feed the root
                        // backdrop blur above — exactly like the Simple layout.
                        val cPanelShape  = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
                        val cGlassTint   = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f)
                        val cGlassBorder = if (isDark) Color.White.copy(alpha = 0.16f)
                                           else Color.White.copy(alpha = 0.42f)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .onGloballyPositioned {
                                    panelPos  = it.positionInRoot()
                                    panelSize = it.size
                                }
                                .clip(cPanelShape)
                                .border(1.dp, cGlassBorder, cPanelShape)
                        ) {
                            Column(
                                modifier            = Modifier
                                    .fillMaxWidth()
                                    .background(cGlassTint)
                                    .padding(horizontal = 16.dp)
                                    .padding(top = 18.dp)
                                    .navigationBarsPadding(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                            // ── Mode cards ─────────────────────────────────
                            Row(
                                modifier              = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                ModeCard(
                                    title    = "Turbo",
                                    icon     = R.drawable.turbo,
                                    selected = isTurbo,
                                    enabled  = controlsEnabled,
                                    mono     = mono,
                                    onClick  = {
                                        bleManager.sendData(Commands.TURBO)
                                        isEco = false; isSleep = false; isNatureWind = false
                                        isTurbo = true; speed = 7f
                                    }
                                )
                                ModeCard(
                                    title    = "Eco",
                                    icon     = R.drawable.eco,
                                    selected = isEco,
                                    enabled  = controlsEnabled,
                                    mono     = mono,
                                    onClick  = {
                                        bleManager.sendData(Commands.ECO)
                                        isTurbo = false; isSleep = false; isNatureWind = false
                                        isEco = true; speed = 4f
                                    }
                                )
                                ModeCard(
                                    title    = "Nature",
                                    icon     = R.drawable.nature_wind,
                                    selected = isNatureWind,
                                    enabled  = controlsEnabled,
                                    mono     = mono,
                                    onClick  = {
                                        bleManager.sendData(Commands.NATURE_WIND)
                                        isTurbo = false; isEco = false; isSleep = false
                                        isNatureWind = true
                                    }
                                )
                                ModeCard(
                                    title    = "Sleep",
                                    icon     = R.drawable.sleep,
                                    selected = isSleep,
                                    enabled  = controlsEnabled,
                                    mono     = mono,
                                    onClick  = {
                                        bleManager.sendData(Commands.SLEEP)
                                        isTurbo = false; isEco = false; isNatureWind = false
                                        isSleep = true; speed = 1f
                                    }
                                )
                            }

                            Spacer(Modifier.height(16.dp))

                            // ── Timer + Power ──────────────────────────────
                            Row(
                                modifier              = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment     = Alignment.CenterVertically
                            ) {
                                val cTimerSrc = remember { MutableInteractionSource() }
                                Button(
                                    onClick           = { showTimerDialog = true },
                                    enabled           = isPowerOn,
                                    shape             = RoundedCornerShape(14.dp),
                                    interactionSource = cTimerSrc,
                                    colors            = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                        contentColor   = MaterialTheme.colorScheme.onSurfaceVariant
                                    ),
                                    modifier          = pressScaleModifier(cTimerSrc).weight(1f)
                                ) {
                                    Icon(
                                        painter            = painterResource(R.drawable.timer),
                                        contentDescription = "Timer",
                                        modifier           = Modifier.size(18.dp)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (currentTimer > 0) "Timer  ${currentTimer}h" else "Timer")
                                }

                                val cLedSrc = remember { MutableInteractionSource() }
                                Button(
                                    onClick           = { showLedDialog = true },
                                    enabled           = isPowerOn,
                                    shape             = RoundedCornerShape(14.dp),
                                    interactionSource = cLedSrc,
                                    colors            = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                        contentColor   = MaterialTheme.colorScheme.onSurfaceVariant
                                    ),
                                    modifier          = pressScaleModifier(cLedSrc).weight(1f)
                                ) {
                                    Icon(
                                        painter            = painterResource(R.drawable.led),
                                        contentDescription = "LED",
                                        modifier           = Modifier.size(18.dp)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text("LED")
                                }

                                PowerButton(
                                    isPowerOn = isPowerOn,
                                    mono      = mono,
                                    onClick   = {
                                        if (isPowerOn) {
                                            bleManager.sendData(Commands.POWER_OFF)
                                            isPowerOn    = false
                                            isTurbo      = false
                                            isEco        = false
                                            isNatureWind = false
                                            isSleep      = false
                                        } else {
                                            bleManager.sendData(Commands.POWER_ON)
                                            isPowerOn = true
                                        }
                                    }
                                )
                            }
                            }
                        }
                      }
                    }

                } else {
                    // =====================================================
                    // DISCONNECTED LAYOUT
                    // =====================================================
                    Box(modifier = Modifier.fillMaxSize()) {
                      // Settings gear, top-end
                      Box(
                          modifier         = Modifier
                              .align(Alignment.TopEnd)
                              .statusBarsPadding()
                              .padding(horizontal = 16.dp, vertical = 8.dp)
                              .size(40.dp)
                              .clip(CircleShape)
                              .bounceClickable { showSettings = true },
                          contentAlignment = Alignment.Center
                      ) {
                          Icon(
                              painter            = painterResource(R.drawable.settings),
                              contentDescription = "Settings",
                              modifier           = Modifier.size(20.dp),
                              tint               = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f)
                          )
                      }
                      Column(
                        modifier            = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .navigationBarsPadding(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Ghost fan in background
                        Image(
                            painter          = painterResource(R.drawable.fan2),
                            contentDescription = null,
                            contentScale     = ContentScale.Fit,
                            modifier         = Modifier
                                .size(200.dp)
                                .alpha(0.08f)
                        )
                        Spacer(Modifier.height(36.dp))
                        Text(
                            text          = "WiFi Fan",
                            style         = MaterialTheme.typography.headlineMedium,
                            fontWeight    = FontWeight.Thin,
                            color         = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                            letterSpacing = 3.sp
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text  = connectionLabel,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f)
                        )
                        Spacer(Modifier.height(40.dp))
                        val connectSrc = remember { MutableInteractionSource() }
                        Button(
                            onClick  = {
                                checkPermissionsAndDo {
                                    showDeviceDialog = true
                                    bleManager.startScanning()
                                }
                            },
                            shape   = RoundedCornerShape(14.dp),
                            enabled = connectionState == BluetoothProfile.STATE_DISCONNECTED,
                            interactionSource = connectSrc,
                            modifier = pressScaleModifier(connectSrc)
                                .padding(horizontal = 32.dp)
                                .fillMaxWidth()
                        ) {
                            Text("Connect")
                        }
                      }
                    }
                }
              }
              }
            }
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
    onLayoutChange: (UiLayout) -> Unit,
    onColorChange: (AppColorScheme) -> Unit,
    onAccentChange: (Int) -> Unit,
    onBackgroundChange: (AppBackground) -> Unit,
    onBack: () -> Unit
) {
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
            modifier          = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier         = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .bounceClickable(onClick = onBack),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter            = painterResource(R.drawable.arrow_back),
                    contentDescription = "Back",
                    modifier           = Modifier.size(22.dp),
                    tint               = MaterialTheme.colorScheme.onBackground
                )
            }
            Spacer(Modifier.width(4.dp))
            Text(
                text       = "Settings",
                style      = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color      = MaterialTheme.colorScheme.onBackground
            )
        }

        Spacer(Modifier.height(28.dp))

        // ── UI Layout ───────────────────────────────────────────────
        SettingHeading("Layout", "How the controls are arranged")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChoiceCard(
                label       = "Simple",
                description = "Simple panel and a slider",
                selected    = uiLayout == UiLayout.SIMPLE,
                modifier    = Modifier.weight(1f),
                onClick     = { onLayoutChange(UiLayout.SIMPLE) }
            )
            ChoiceCard(
                label       = "Classic",
                description = "Circular dial and cards",
                selected    = uiLayout == UiLayout.CLASSIC,
                modifier    = Modifier.weight(1f),
                onClick     = { onLayoutChange(UiLayout.CLASSIC) }
            )
        }

        Spacer(Modifier.height(32.dp))

        // ── Background ──────────────────────────────────────────────
        SettingHeading("Background", "What appears behind the controls")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChoiceCard(
                label       = "Particles",
                description = "Gentle drifting dots",
                selected    = background == AppBackground.SIMPLE,
                modifier    = Modifier.weight(1f),
                onClick     = { onBackgroundChange(AppBackground.SIMPLE) }
            )
            ChoiceCard(
                label       = "Image",
                description = "An image wallpaper",
                selected    = background == AppBackground.IMAGE,
                modifier    = Modifier.weight(1f),
                onClick     = { onBackgroundChange(AppBackground.IMAGE) }
            )
        }

        Spacer(Modifier.height(32.dp))

        // ── Color Scheme ────────────────────────────────────────────
        SettingHeading("Color", "Accent and overall tone")
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChoiceCard(
                label       = "Monochrome",
                description = "Grayscale, accent on the edges",
                selected    = colorScheme == AppColorScheme.MONOCHROME,
                modifier    = Modifier.weight(1f),
                onClick     = { onColorChange(AppColorScheme.MONOCHROME) }
            )
            ChoiceCard(
                label       = "Colored",
                description = "Choose a custom color",
                selected    = colorScheme == AppColorScheme.COLORED,
                modifier    = Modifier.weight(1f),
                onClick     = { onColorChange(AppColorScheme.COLORED) }
            )
        }

        // ── Accent picker — only relevant for the Colored scheme ─────
        if (colorScheme == AppColorScheme.COLORED) {
            Spacer(Modifier.height(28.dp))
            AccentColorPicker(selected = accentColor, onPick = onAccentChange)
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AccentColorPicker(selected: Int, onPick: (Int) -> Unit) {
    SettingHeading("Accent", "Pick a preset or drag for any shade")
    Spacer(Modifier.height(14.dp))

    // Preset swatches
    Row(
        modifier              = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        AccentPresets.forEach { c ->
            val argb  = c.toArgb()
            val isSel = argb == selected
            Box(
                modifier         = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(c)
                    .border(
                        width = if (isSel) 3.dp else 1.dp,
                        color = if (isSel) MaterialTheme.colorScheme.onBackground
                                else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.10f),
                        shape = CircleShape
                    )
                    .bounceClickable(pressedScale = 0.85f) { onPick(argb) }
            )
        }
    }

    Spacer(Modifier.height(20.dp))

    // Custom hue spectrum
    HueSlider(
        selected = Color(selected),
        onPick   = { onPick(it.toArgb()) },
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun HueSlider(
    selected: Color,
    onPick: (Color) -> Unit,
    modifier: Modifier = Modifier
) {
    var widthPx by remember { mutableIntStateOf(1) }
    val hsv = remember(selected) {
        FloatArray(3).also { AndroidColor.colorToHSV(selected.toArgb(), it) }
    }
    val hue = hsv[0]
    val rainbow = remember {
        listOf(
            Color(0xFFFF0000), Color(0xFFFFFF00), Color(0xFF00FF00),
            Color(0xFF00FFFF), Color(0xFF0000FF), Color(0xFFFF00FF), Color(0xFFFF0000)
        )
    }

    fun pick(x: Float) {
        val h    = (x / widthPx.toFloat()).coerceIn(0f, 1f) * 360f
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
            }
    ) {
        drawRect(brush = Brush.horizontalGradient(rainbow))
        val r  = size.height / 2f
        val tx = (hue / 360f * size.width).coerceIn(r, size.width - r)
        drawCircle(Color.White, radius = r - 2.dp.toPx(), center = Offset(tx, size.height / 2f))
        drawCircle(selected,    radius = r - 5.dp.toPx(), center = Offset(tx, size.height / 2f))
    }
}

@Composable
private fun SettingHeading(title: String, subtitle: String) {
    Text(
        text       = title,
        style      = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color      = MaterialTheme.colorScheme.onBackground
    )
    Spacer(Modifier.height(2.dp))
    Text(
        text  = subtitle,
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
        targetValue   = if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.12f),
        animationSpec = tween(220),
        label         = "choiceBorder"
    )
    val bgColor by animateColorAsState(
        targetValue   = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
                        else Color.Transparent,
        animationSpec = tween(220),
        label         = "choiceBg"
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
            text       = label,
            style      = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color      = if (selected) MaterialTheme.colorScheme.primary
                         else MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text  = description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
        )
    }
}

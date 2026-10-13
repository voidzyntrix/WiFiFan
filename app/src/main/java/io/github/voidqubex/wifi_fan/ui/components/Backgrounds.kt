package io.github.voidqubex.wifi_fan.ui.components

import android.content.Context
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.graphics.Shader
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

// ---------------------------------------------------------------------------
// Aurora: soft glows drifting slowly, in the LED's colour
// ---------------------------------------------------------------------------

/** Four large soft glows wandering over the background, tinted around [hue] (degrees). */
@Composable
fun AuroraBackground(modifier: Modifier = Modifier, hue: Float, saturation: Float) {
    var t by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { t = (it - start) / 1e9f }
    }
    val sat = saturation.coerceIn(0.35f, 0.85f)
    Canvas(modifier) {
        val glows = listOf(
            // hue offset, x/y speeds, phase
            floatArrayOf(0f, 0.050f, 0.037f, 0f),
            floatArrayOf(35f, 0.041f, 0.053f, 2.1f),
            floatArrayOf(-40f, 0.033f, 0.029f, 4.0f),
            floatArrayOf(160f, 0.027f, 0.045f, 5.3f)
        )
        val r = size.maxDimension * 0.55f
        glows.forEachIndexed { i, g ->
            val c = Offset(
                size.width * (0.5f + 0.42f * sin(t * g[1] * 6.2832f + g[3])),
                size.height * (0.5f + 0.42f * cos(t * g[2] * 6.2832f + g[3] * 1.3f))
            )
            val h = ((hue + g[0]) % 360f + 360f) % 360f
            val colour = Color.hsv(h, sat, 1f, alpha = if (i == 3) 0.16f else 0.26f)
            drawCircle(
                Brush.radialGradient(listOf(colour, colour.copy(alpha = 0f)), c, r),
                radius = r, center = c
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Fluid: a liquid that sloshes with the phone (accelerometer + gyroscope)
// ---------------------------------------------------------------------------

/** Steps per second; [FluidSim]'s constants are tuned for it (4 a frame at 60 Hz). */
private const val STEP_RATE = 240f
/** 1 g in sim units (radii per step²) at [STEP_RATE]. */
private const val ONE_G = 0.003f
/** The box is this many interaction radii wide; its height follows the screen. */
private const val SIM_WIDTH = 14f
/** Liquid fills about the bottom quarter of a phone screen. */
private const val PARTICLES_PER_AREA = 600f / (14f * 31f)

/**
 * Liquid in the phone: tilting pours it, shaking splashes it, and twisting the phone leaves
 * it behind (the gyroscope). Drawn as metaballs: soft particles blurred together and cut at
 * a threshold so they merge into one smooth surface.
 */
@Composable
fun FluidBackground(modifier: Modifier = Modifier, tint: Color) {
    val context = LocalContext.current
    val motion = remember { PhoneMotion(context) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        // sensors only while the app is on screen
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> motion.start()
                Lifecycle.Event.ON_PAUSE -> motion.stop()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); motion.stop() }
    }

    var boxW by remember { mutableIntStateOf(0) }
    var boxH by remember { mutableIntStateOf(0) }
    var frame by remember { mutableLongStateOf(0L) }
    val sim = remember(boxW, boxH) {
        if (boxW == 0 || boxH == 0) null else {
            val h = SIM_WIDTH * boxH / boxW
            FluidSim(SIM_WIDTH, h, (SIM_WIDTH * h * PARTICLES_PER_AREA).roundToInt().coerceIn(100, 900))
        }
    }
    // what the canvas draws: a copy, so drawing never sees a half-done step
    val shown = remember(sim) { sim?.let { FloatArray(it.count * 2) } }

    LaunchedEffect(sim) {
        if (sim == null || shown == null) return@LaunchedEffect
        var last = withFrameNanos { it }
        while (true) {
            val now = withFrameNanos { it }
            val steps = ((now - last) / 1e9f * STEP_RATE).roundToInt().coerceIn(1, 8)
            last = now
            withContext(Dispatchers.Default) {
                val (gx, gy) = motion.screenGravity()
                // gyroscope z: anticlockwise on screen is positive; the sim's spin is clockwise
                val spin = -motion.calmSpin() / STEP_RATE
                repeat(steps) { sim.step(gx * ONE_G, gy * ONE_G, spin) }
            }
            for (i in 0 until sim.count) { shown[2 * i] = sim.x[i]; shown[2 * i + 1] = sim.y[i] }
            frame++
        }
    }

    // Two copies of the liquid: the whole blob, and a slightly smaller one that cuts most of
    // its inside away again. What's left is a bright rim round a faint, see-through body.
    val full = rememberGraphicsLayer()
    val inner = rememberGraphicsLayer()
    val cell = if (boxW > 0) boxW / SIM_WIDTH else 1f
    remember(cell) {
        full.renderEffect = metaballs(cell * 0.32f, 0.45f).asComposeRenderEffect()
        inner.renderEffect = metaballs(cell * 0.32f, 0.7f).asComposeRenderEffect()
        inner.blendMode = BlendMode.DstOut
        inner.alpha = 0.8f
    }
    Canvas(
        modifier
            .onSizeChanged { boxW = it.width; boxH = it.height }
            .graphicsLayer {
                compositingStrategy = CompositingStrategy.Offscreen
                alpha = 0.75f
            }
    ) {
        @Suppress("UNUSED_EXPRESSION") frame
        if (sim == null || shown == null) return@Canvas
        val r = cell * 0.42f
        val particles: DrawScope.() -> Unit = {
            for (i in 0 until sim.count) {
                drawCircle(tint, r, Offset(shown[2 * i] * cell, shown[2 * i + 1] * cell))
            }
        }
        full.record(block = particles)
        inner.record(block = particles)
        drawLayer(full)
        drawLayer(inner)
    }
}

/**
 * Blur, then a steep alpha curve: overlapping soft dots melt into one sharp-edged blob.
 * A higher [level] gives a slightly smaller blob.
 */
private fun metaballs(blur: Float, level: Float): RenderEffect {
    val threshold = ColorMatrix(
        floatArrayOf(
            1f, 0f, 0f, 0f, 0f,
            0f, 1f, 0f, 0f, 0f,
            0f, 0f, 1f, 0f, 0f,
            0f, 0f, 0f, 18f, -18f * level * 255f
        )
    )
    return RenderEffect.createColorFilterEffect(
        ColorMatrixColorFilter(threshold),
        RenderEffect.createBlurEffect(max(blur, 1f), max(blur, 1f), Shader.TileMode.CLAMP)
    )
}

/**
 * The phone's felt gravity (accelerometer, so shakes count too) in screen axes, and how fast
 * it turns in the screen's plane (gyroscope). Values in g and rad/s.
 */
private class PhoneMotion(context: Context) : SensorEventListener {
    private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val display = context.display
    @Volatile private var ax = 0f
    @Volatile private var ay = 1f   // until the sensor reports: held upright
    @Volatile var spinRate = 0f
        private set
    private var running = false

    fun start() {
        if (running) return
        running = true
        sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let {
            sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        if (!running) return
        running = false
        sensors.unregisterListener(this)
        spinRate = 0f
    }

    /** Gravity in screen axes (x right, y down), in g. */
    fun screenGravity(): Pair<Float, Float> {
        // the accelerometer reads "up" (it measures the push holding the phone); the liquid
        // falls the other way. Device axes: x right, y up the screen in its natural orientation.
        val dx = -ax
        val dy = -ay
        val (sx, sy) = when (display?.rotation) {
            Surface.ROTATION_90 -> -dy to dx
            Surface.ROTATION_180 -> -dx to -dy
            Surface.ROTATION_270 -> dy to -dx
            else -> dx to dy
        }
        return soften(sx) to soften(-sy)
    }

    /**
     * A small tilt does nothing (dead zone), larger ones pour gently, and shakes are capped, so
     * holding the phone a little off straight doesn't send the liquid flying.
     */
    private fun soften(g: Float): Float {
        val v = when {
            g > TILT_DEAD -> (g - TILT_DEAD) / (1f - TILT_DEAD)
            g < -TILT_DEAD -> (g + TILT_DEAD) / (1f - TILT_DEAD)
            else -> 0f
        }
        return (v * TILT_GAIN).coerceIn(-MAX_G, MAX_G)
    }

    /** The turn rate with a dead zone and less punch: only a real twist swirls the liquid. */
    fun calmSpin(): Float {
        val r = spinRate
        return when {
            r > SPIN_DEAD -> (r - SPIN_DEAD) * SPIN_GAIN
            r < -SPIN_DEAD -> (r + SPIN_DEAD) * SPIN_GAIN
            else -> 0f
        }
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                // steady smoothing (~0.2 s): a jolt or a hand tremor barely moves the liquid
                ax += (e.values[0] / SensorManager.GRAVITY_EARTH - ax) * SMOOTHING
                ay += (e.values[1] / SensorManager.GRAVITY_EARTH - ay) * SMOOTHING
            }
            Sensor.TYPE_GYROSCOPE -> spinRate = e.values[2]
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private companion object {
        /** Share of each accelerometer reading taken (50 a second). */
        const val SMOOTHING = 0.1f
        /** Tilts below this (in g, about 7 degrees) don't move the liquid. */
        const val TILT_DEAD = 0.12f
        /** Gravity felt by the liquid, relative to the real thing. */
        const val TILT_GAIN = 0.7f
        /** Shakes are capped at this many g. */
        const val MAX_G = 1f
        /** Turn rates below this (rad/s) leave the liquid alone; above, a share of it swirls it. */
        const val SPIN_DEAD = 0.4f
        const val SPIN_GAIN = 0.35f
    }
}

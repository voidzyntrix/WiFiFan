package io.github.voidqubex.wifi_fan.led

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.lerp
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Colour maths for the LED picker. The board drives the LED with linear PWM (no gamma). */
object LedColor {
    const val KELVIN_MIN = 1800f
    const val KELVIN_MAX = 10000f

    /** Blackbody chromaticity (Kim et al. approximation, 1667-25000 K). */
    private fun blackbodyXy(k: Double): DoubleArray {
        val x = if (k <= 4000) -0.2661239e9 / (k * k * k) - 0.2343589e6 / (k * k) + 0.8776956e3 / k + 0.179910
        else -3.0258469e9 / (k * k * k) + 2.1070379e6 / (k * k) + 0.2226347e3 / k + 0.240390
        val y = when {
            k <= 2222 -> -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683
            k <= 4000 -> -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
            else -> 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483
        }
        return doubleArrayOf(x, y)
    }

    /** Linear sRGB of a blackbody, largest channel = 1. */
    private fun kelvinLinear(kelvin: Float): DoubleArray {
        val (x, y) = blackbodyXy(kelvin.toDouble()).let { it[0] to it[1] }
        val bx = x / y
        val bz = (1 - x - y) / y
        val r = max(0.0, 3.2404542 * bx - 1.5371385 - 0.4985314 * bz)
        val g = max(0.0, -0.9692660 * bx + 1.8760108 + 0.0415560 * bz)
        val b = max(0.0, 0.0556434 * bx - 0.2040259 + 1.0572252 * bz)
        val m = max(r, max(g, b))
        return doubleArrayOf(r / m, g / m, b / m)
    }

    /** Hue (degrees) and saturation (0..1) for a colour temperature, at full brightness. */
    fun kelvinToHueSat(kelvin: Float): FloatArray {
        val c = kelvinLinear(kelvin)
        val mx = max(c[0], max(c[1], c[2]))
        val mn = min(c[0], min(c[1], c[2]))
        val d = mx - mn
        val h = when {
            d == 0.0 -> 0.0
            mx == c[0] -> 60 * (((c[1] - c[2]) / d + 6) % 6)
            mx == c[1] -> 60 * ((c[2] - c[0]) / d + 2)
            else -> 60 * ((c[0] - c[1]) / d + 4)
        }
        return floatArrayOf(h.toFloat(), (d / mx).toFloat())
    }

    private fun encode(c: Double): Float {
        val v = c.coerceIn(0.0, 1.0)
        return (if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055).toFloat()
    }

    /** What a colour temperature looks like on screen (for sliders and swatches). */
    fun kelvinScreenColor(kelvin: Float): Color {
        val c = kelvinLinear(kelvin)
        return Color(encode(c[0]), encode(c[1]), encode(c[2]))
    }

    private fun hsvToLinear(h: Float, s: Float, v: Float): DoubleArray {
        val hh = ((h % 360f) + 360f) % 360f / 60f
        val i = hh.toInt() % 6
        val f = hh - hh.toInt()
        val p = v * (1 - s); val q = v * (1 - s * f); val t = v * (1 - s * (1 - f))
        val (r, g, b) = when (i) {
            0 -> Triple(v, t, p); 1 -> Triple(q, v, p); 2 -> Triple(p, v, t)
            3 -> Triple(p, q, v); 4 -> Triple(t, p, v); else -> Triple(v, p, q)
        }
        return doubleArrayOf(r.toDouble(), g.toDouble(), b.toDouble())
    }

    /** Colour of the glow at radius [rho] (0 centre .. 1 edge): linear light, bright core burns to white. */
    fun glowColor(lin: DoubleArray, rho: Double): Color {
        val disc = 1.0 / (1.0 + exp((rho - 0.12) / 0.024))
        val glow = 0.6 * exp(-0.5 * (rho / 0.21) * (rho / 0.21))
        val glare = 0.11 * (1.0 + (rho / 0.25) * (rho / 0.25)).pow(-1.35)
        val win = (1.0 - ((rho - 0.7) / 0.3).coerceIn(0.0, 1.0).let { it * it * (3 - 2 * it) })
        val k = (disc + glow + glare) * win
        var r = lin[0] * k; var g = lin[1] * k; var b = lin[2] * k
        val pk = max(r, max(g, b))
        val y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (pk > 1) { r /= pk; g /= pk; b /= pk }
        val t = ((y - 0.9) / 2.3).coerceIn(0.0, 1.0).let { it * it * (3 - 2 * it) } * 0.8
        r = r * (1 - t) + t; g = g * (1 - t) + t; b = b * (1 - t) + t
        val bg = 0.012f
        return Color(max(bg, encode(r)), max(bg, encode(g)), max(bg, encode(b)))
    }

    private val RADII = floatArrayOf(
        0f, .03f, .06f, .09f, .105f, .115f, .125f, .135f, .15f, .165f, .19f, .22f, .265f,
        .33f, .415f, .52f, .65f, .82f, 1f
    )

    fun glowStops(h: Float, s: Float, v: Float): Array<Pair<Float, Color>> {
        val lin = hsvToLinear(h, s, v)
        return Array(RADII.size) { RADII[it] to glowColor(lin, RADII[it].toDouble()) }
    }
}

/** The LED as a simple circle: filled with its colour, thin outline, soft glow around it. */
@Composable
fun LedPreview(hue: Float, sat: Float, value: Float, modifier: Modifier = Modifier) {
    val target = Color(
        android.graphics.Color.HSVToColor(
            floatArrayOf(((hue % 360f) + 360f) % 360f, sat.coerceIn(0f, 1f), 1f)
        )
    )
    val color by animateColorAsState(target, tween(150), label = "ledColor")
    val level by animateFloatAsState(value.coerceIn(0f, 1f), tween(150), label = "ledLevel")
    // Fully off still shows a dim, outlined disc.
    val lit = (level * 4f).coerceIn(0f, 1f)

    Box(modifier, contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .fillMaxHeight(0.78f)
                .aspectRatio(1f)
                .shadow(
                    elevation = (2f + 34f * lit * (0.35f + 0.65f * level)).dp,
                    shape = CircleShape,
                    ambientColor = color,
                    spotColor = color
                )
                .clip(CircleShape)
                .background(lerp(Color(0xFF1A1A1A), color, (0.15f + 0.85f * level) * lit))
                .border(
                    2.dp,
                    lerp(Color.White.copy(alpha = 0.18f), color, lit).copy(alpha = 0.45f + 0.55f * lit),
                    CircleShape
                )
        )
    }
}

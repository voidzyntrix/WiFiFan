package io.github.voidqubex.wifi_fan.ui.components

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Bends the backdrop along a rounded rectangle's rim, like the edge of a thick glass pane: the
 * middle shows the background as it is, the last [EDGE] before the border pulls it inwards (with
 * a hint of colour fringing) and catches a little light from the top left.
 */
private const val GLASS_SHADER = """
uniform shader content;
uniform float2 size;
uniform float radius;
uniform float edge;
uniform float strength;

float sdRoundRect(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

half4 main(float2 coord) {
    float2 hs = size * 0.5;
    float2 p = coord - hs;
    float depth = -sdRoundRect(p, hs, radius);
    if (depth >= edge) return content.eval(coord);

    // outward normal of the rim
    float2 n = float2(
        sdRoundRect(p + float2(1.0, 0.0), hs, radius) - sdRoundRect(p - float2(1.0, 0.0), hs, radius),
        sdRoundRect(p + float2(0.0, 1.0), hs, radius) - sdRoundRect(p - float2(0.0, 1.0), hs, radius));
    n = n / max(length(n), 0.0001);

    // circular bevel: flat inside, steepest right at the border
    float k = 1.0 - clamp(depth / edge, 0.0, 1.0);
    float bend = 1.0 - sqrt(max(1.0 - k * k, 0.0));
    float2 off = n * strength * bend;

    half4 c = content.eval(coord - off);
    c.r = content.eval(coord - off * 1.03).r;
    c.b = content.eval(coord - off * 0.97).b;

    float light = max(dot(n, float2(-0.7071, -0.7071)), 0.0) * bend * 0.22;
    return half4(min(c.rgb + light, 1.0), c.a);
}
"""

private val EDGE = 18.dp
private val STRENGTH = 16.dp

/**
 * Draws [backdrop] (the whole screen's background) behind this element, refracted at its rim.
 * [position] is where the element sits on screen, so the backdrop lines up with what is behind
 * it. Refraction needs Android 13; older versions draw nothing, which looks the same minus the
 * bent rim since the element is see-through anyway.
 */
@Composable
internal fun Modifier.refractiveBackdrop(
    backdrop: GraphicsLayer?,
    position: () -> Offset,
    cornerRadius: Dp
): Modifier {
    if (backdrop == null) return this
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        val rim = rememberGraphicsLayer()
        val mask = rememberGraphicsLayer()
        remember(rim, mask) {
            rim.compositingStrategy = androidx.compose.ui.graphics.layer.CompositingStrategy.Offscreen
            mask.blendMode = androidx.compose.ui.graphics.BlendMode.DstIn
        }
        return this.drawBehind { fadedGlass(backdrop, rim, mask, position(), cornerRadius.toPx()) }
    }
    val layer = rememberGraphicsLayer()
    val glass = remember { GlassEffect() }
    return this.drawBehind {
        val p = position()
        layer.renderEffect = glass.effect(
            size.width, size.height,
            cornerRadius.toPx().coerceAtMost(size.minDimension / 2f),
            EDGE.toPx(), STRENGTH.toPx()
        )
        layer.record { translate(-p.x, -p.y) { drawLayer(backdrop) } }
        drawLayer(layer)
    }
}

/**
 * Android 12 has no shaders for the glass, so the rim is faked smoothly: a slightly magnified
 * copy of the background (pulled inwards, like the bent edge of a thick pane) fades in towards
 * the border through a soft mask, over the clear background. No hard steps, one extra copy.
 */
private fun DrawScope.fadedGlass(
    backdrop: GraphicsLayer, rim: GraphicsLayer, mask: GraphicsLayer, p: Offset, corner: Float
) {
    val r = corner.coerceAtMost(size.minDimension / 2f)
    val edge = EDGE.toPx().coerceAtMost(size.minDimension / 2f)
    val off = STRENGTH.toPx() * 0.8f
    val sx = 1f / (1f - off / (size.width / 2f)).coerceAtLeast(0.3f)
    val sy = 1f / (1f - off / (size.height / 2f)).coerceAtLeast(0.3f)
    translate(-p.x, -p.y) { drawLayer(backdrop) }
    // the mask: opaque at the border, fading to nothing [edge] inside (thin rings blended by
    // anti-aliasing, so it reads as one smooth gradient)
    mask.record {
        val n = 14
        val w = edge / n
        for (i in 0 until n) {
            val t = (i + 0.5f) / n                 // 0 at the border, 1 at the inner end
            val a = (1f - t) * (1f - t)
            val inset = w * i + w / 2f
            drawRoundRect(
                Color.Black.copy(alpha = a),
                topLeft = Offset(inset, inset),
                size = androidx.compose.ui.geometry.Size(size.width - inset * 2f, size.height - inset * 2f),
                cornerRadius = CornerRadius((r - inset).coerceAtLeast(0f)),
                style = Stroke(w * 1.2f)
            )
        }
    }
    rim.record {
        scale(sx, sy, pivot = center) { translate(-p.x, -p.y) { drawLayer(backdrop) } }
        drawLayer(mask)
    }
    drawLayer(rim)
    drawRoundRect(
        Brush.linearGradient(
            listOf(Color.White.copy(alpha = 0.22f), Color.Transparent),
            start = Offset.Zero, end = Offset(size.width * 0.5f, size.height * 0.5f)
        ),
        topLeft = Offset(edge / 4f, edge / 4f),
        size = androidx.compose.ui.geometry.Size(size.width - edge / 2f, size.height - edge / 2f),
        cornerRadius = CornerRadius((r - edge / 4f).coerceAtLeast(0f)),
        style = Stroke(edge / 2f)
    )
}

/** The shader effect, rebuilt only when the element's size or corners change. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class GlassEffect {
    private val shader = RuntimeShader(GLASS_SHADER)
    private var key: List<Float>? = null
    private var effect: androidx.compose.ui.graphics.RenderEffect? = null

    fun effect(w: Float, h: Float, radius: Float, edge: Float, strength: Float): androidx.compose.ui.graphics.RenderEffect {
        val k = listOf(w, h, radius, edge, strength)
        effect?.takeIf { k == key }?.let { return it }
        shader.setFloatUniform("size", w, h)
        shader.setFloatUniform("radius", radius)
        shader.setFloatUniform("edge", edge)
        shader.setFloatUniform("strength", strength)
        return RenderEffect.createRuntimeShaderEffect(shader, "content").asComposeRenderEffect()
            .also { key = k; effect = it }
    }
}

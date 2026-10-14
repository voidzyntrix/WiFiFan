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
import androidx.compose.ui.graphics.asComposeRenderEffect
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
    if (backdrop == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return this
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

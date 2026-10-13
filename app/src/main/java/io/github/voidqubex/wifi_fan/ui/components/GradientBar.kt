package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionOnScreen
import io.github.voidqubex.wifi_fan.ui.theme.dotCorner
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import kotlin.math.roundToInt

// ---------------------------------------------------------------------------
// Gradient bar — a draggable colour strip (hue, saturation, brightness, kelvin)
// ---------------------------------------------------------------------------

@Composable
internal fun GradientBar(
    fraction: Float,
    stops: List<Color>,
    thumbColor: Color,
    onFraction: (Float) -> Unit,
    onFinished: () -> Unit
) {
    val currentOnFraction by rememberUpdatedState(onFraction)
    val currentOnFinished by rememberUpdatedState(onFinished)
    val haptics = rememberHaptics()
    val blurLayer = LocalBlurLayer.current
    val backdrop = LocalBackdropLayer.current
    var barPos by remember { mutableStateOf(Offset.Zero) }

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
            .onGloballyPositioned { barPos = it.positionOnScreen() }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    // A light tick for every 5 % step while dragging.
                    var step = -1
                    fun report(p: Offset) {
                        val f = (p.x / size.width).coerceIn(0f, 1f)
                        val s = (f * HAPTIC_STEPS).roundToInt()
                        if (step >= 0 && s != step) haptics.tick()
                        step = s
                        currentOnFraction(f)
                    }
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
            cornerRadius = CornerRadius(barH / 2f * AppLook.cornerScale.coerceAtMost(1f))
        )
        val tc = Offset(fraction * size.width, size.height / 2f)
        val tr = 11.dp.toPx()
        drawDot(Color.Black.copy(alpha = 0.25f), radius = 13.dp.toPx(), center = tc)
        // a glass bead: the background seen through it (blurred, or sharp with Refractive glass)
        val seen = if (AppLook.refractiveGlass) backdrop else blurLayer
        if (seen != null) {
            val bead = Path().apply { addRoundRect(RoundRect(Rect(tc, tr), CornerRadius(dotCorner(tr)))) }
            clipPath(bead) { translate(-barPos.x, -barPos.y) { drawLayer(seen) } }
        }
        drawDot(Color.White.copy(alpha = 0.4f), radius = tr, center = tc)
        drawDot(thumbColor, radius = 7.dp.toPx(), center = tc)
    }
}

private const val HAPTIC_STEPS = 20

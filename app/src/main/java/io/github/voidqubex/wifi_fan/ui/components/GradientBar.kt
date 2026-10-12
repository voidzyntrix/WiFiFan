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

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
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
        drawDot(Color.Black.copy(alpha = 0.3f), radius = 13.dp.toPx(), center = tc)
        drawDot(Color.White, radius = 11.dp.toPx(), center = tc)
        drawDot(thumbColor, radius = 8.dp.toPx(), center = tc)
    }
}

private const val HAPTIC_STEPS = 20

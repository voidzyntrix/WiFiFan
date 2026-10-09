package io.github.voidqubex.wifi_fan

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

@Composable
fun CircularSlider(
    modifier: Modifier = Modifier,
    value: Int,
    primaryColor: Color,
    secondaryColor: Color,
    minValue: Int = 1,
    maxValue: Int = 100,
    circleRadius: Float,
    disabled: Boolean = false,
    onPositionChange: (Int) -> Unit
) {

    var circleCenter by remember {
        mutableStateOf(Offset.Zero)
    }

    var targetValue by remember {
        mutableIntStateOf(value)
    }

    val animatedValue = remember {
        Animatable(value.toFloat())
    }

    // Sync external updates
    LaunchedEffect(value) {
        targetValue = value
    }

    // Animate slider movement
    LaunchedEffect(targetValue) {
        animatedValue.animateTo(targetValue.toFloat())
    }

    // Disabled colors — scale the incoming alpha so a translucent input (e.g. a
    // see-through track over the wallpaper) fades further rather than turning
    // more opaque. Opaque inputs (alpha 1f) still land at 0.4f as before.
    val activePrimary =
        if (disabled) primaryColor.copy(alpha = primaryColor.alpha * 0.4f)
        else primaryColor

    val activeSecondary =
        if (disabled) secondaryColor.copy(alpha = secondaryColor.alpha * 0.4f)
        else secondaryColor

    fun updateValue(newValue: Int) {

        if (disabled) return

        val clamped = newValue.coerceIn(minValue, maxValue)

        // Prevent direct wraparound jump
        val isMinToMax =
            targetValue == minValue && clamped == maxValue

        val isMaxToMin =
            targetValue == maxValue && clamped == minValue

        if (isMinToMax || isMaxToMin) {
            return
        }

        if (clamped != targetValue) {
            targetValue = clamped
            onPositionChange(clamped)
        }
    }

    fun offsetToValue(offset: Offset): Int {

        var angle = -atan2(
            x = circleCenter.y - offset.y,
            y = circleCenter.x - offset.x
        ) * (180f / PI.toFloat())

        angle = (angle + 180f).mod(360f)

        val fraction = angle / 360f

        val value =
            minValue + fraction * (maxValue - minValue)

        return value.roundToInt()
    }

    Box(
        modifier = modifier
    ) {

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(disabled) {

                    if (!disabled) {

                        coroutineScope {

                            launch {

                                detectDragGestures(
                                    onDrag = { change, _ ->

                                        change.consume()

                                        updateValue(
                                            offsetToValue(change.position)
                                        )
                                    }
                                )
                            }

                            launch {

                                detectTapGestures(
                                    onTap = { offset ->

                                        updateValue(
                                            offsetToValue(offset)
                                        )
                                    }
                                )
                            }
                        }
                    }
                }
        ) {

            val width = size.width
            val height = size.height

            val circleThickness = width / 25f

            circleCenter = Offset(
                x = width / 2f,
                y = height / 2f
            )

            // Background ring
            drawCircle(
                style = Stroke(width = circleThickness),
                color = activeSecondary,
                radius = circleRadius,
                center = circleCenter
            )

            // Foreground progress
            val fraction =
                (animatedValue.value - minValue) /
                        (maxValue - minValue)

            val sweepAngle = fraction * 360f

            drawArc(
                color = activePrimary,
                startAngle = 90f,
                sweepAngle = sweepAngle,
                style = Stroke(
                    width = circleThickness,
                    cap = StrokeCap.Round
                ),
                useCenter = false,
                size = Size(
                    width = circleRadius * 2f,
                    height = circleRadius * 2f
                ),
                topLeft = Offset(
                    (width - circleRadius * 2f) / 2f,
                    (height - circleRadius * 2f) / 2f
                )
            )

            // Tick marks
            val outerRadius =
                circleRadius + circleThickness / 2f

            val gap = 15f

            val steps = maxValue - minValue

            for (i in 0..steps) {

                val isActive =
                    i <= (targetValue - minValue)

                val color =
                    if (isActive) activePrimary
                    else activePrimary.copy(alpha = 0.3f)

                val angleDeg =
                    i * 360f / steps

                val angleRad =
                    angleDeg * PI / 180f + PI / 2f

                val yGap =
                    cos(angleDeg * PI / 180f) * gap

                val xGap =
                    -sin(angleDeg * PI / 180f) * gap

                val start = Offset(
                    x = (
                            outerRadius * cos(angleRad) +
                                    circleCenter.x +
                                    xGap
                            ).toFloat(),

                    y = (
                            outerRadius * sin(angleRad) +
                                    circleCenter.y +
                                    yGap
                            ).toFloat()
                )

                val end = Offset(
                    x = (
                            outerRadius * cos(angleRad) +
                                    circleCenter.x +
                                    xGap
                            ).toFloat(),

                    y = (
                            outerRadius * sin(angleRad) +
                                    circleThickness +
                                    circleCenter.y +
                                    yGap
                            ).toFloat()
                )

                rotate(
                    angleDeg,
                    pivot = start
                ) {

                    drawLine(
                        color = color,
                        start = start,
                        end = end,
                        strokeWidth = 1.dp.toPx()
                    )
                }
            }
        }
    }
}

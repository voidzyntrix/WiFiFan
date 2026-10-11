package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlin.random.Random
import kotlinx.coroutines.delay

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
            drawDot(
                color = tint.copy(alpha = p.alpha),
                radius = p.radiusDp.dp.toPx(),
                center = Offset(p.xFrac * size.width, p.yFrac * size.height)
            )
        }
    }
}

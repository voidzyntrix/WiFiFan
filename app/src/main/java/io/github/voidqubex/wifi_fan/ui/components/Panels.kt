package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.dotCorner
import io.github.voidqubex.wifi_fan.ui.theme.rounded
import kotlinx.coroutines.delay

/** The blurred screen backdrop that [PanelCard] draws behind itself. */
internal val LocalBlurLayer = staticCompositionLocalOf<GraphicsLayer?> { null }

/** A dot drawn on a canvas; round like [circle], so it follows the corner setting. */
internal fun DrawScope.drawDot(color: Color, radius: Float, center: Offset) = drawRoundRect(
    color = color,
    topLeft = Offset(center.x - radius, center.y - radius),
    size = androidx.compose.ui.geometry.Size(radius * 2f, radius * 2f),
    cornerRadius = CornerRadius(dotCorner(radius))
)

/** The sharp (unblurred) screen backdrop, for the Refractive glass look. */
internal val LocalBackdropLayer = staticCompositionLocalOf<GraphicsLayer?> { null }

/** Rounded translucent panel that groups a block of controls. */
@Composable
internal fun PanelCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val blurLayer = LocalBlurLayer.current
    var pos by remember { mutableStateOf(Offset.Zero) }
    val surface = if (AppLook.refractiveGlass) {
        // refractive glass: clear in the middle, bent at the rim, a touch darker
        Modifier
            .refractiveBackdrop(LocalBackdropLayer.current, { pos }, 24.dp * AppLook.cornerScale)
            .background(Color.Black.copy(alpha = 0.22f))
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(Color.White.copy(alpha = 0.28f), Color.White.copy(alpha = 0.04f), Color.White.copy(alpha = 0.14f))
                ),
                rounded(24.dp)
            )
    } else {
        Modifier
            // frosted glass: the blurred backdrop, shifted so it lines up with the screen
            .drawBehind {
                if (blurLayer != null) translate(-pos.x, -pos.y) { drawLayer(blurLayer) }
            }
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.4f))
            .border(
                1.dp,
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                rounded(24.dp)
            )
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .onGloballyPositioned { pos = it.positionInRoot() }
            .clip(rounded(24.dp))
            .then(surface)
            .padding(16.dp),
        content = content
    )
}

/** Fade + slide up when first shown, staggered by [index]. */
@Composable
internal fun Modifier.entrance(index: Int): Modifier {
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
internal fun SliderLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
    )
}

@Composable
internal fun PresetDot(color: Color, onClick: () -> Unit) {
    val haptics = rememberHaptics()
    Box(
        modifier = Modifier
            .size(if (isCompact()) 26.dp else 30.dp)
            .clip(circle())
            .background(color)
            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f), circle())
            .bounceClickable(pressedScale = 0.85f) { haptics.tap(); onClick() }
    )
}

@Composable
internal fun CircleIconButton(icon: Int, description: String, onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(44.dp)
            .clip(circle())
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

package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.ui.theme.LocalPureMono
import io.github.voidqubex.wifi_fan.ui.theme.rounded

// ---------------------------------------------------------------------------
// Press feedback — replaces the default Material ripple with a subtle bounce
// ---------------------------------------------------------------------------

/** Monochrome's button fill: the accent blended deep into the background. */
@Composable
internal fun monoFill(strength: Float = 0.22f): Color {
    val cs = MaterialTheme.colorScheme
    return lerp(cs.background, cs.primary, strength)
}

/** Filled accent button, or in Monochrome a dark accent-tinted one with an accent rim. */
@Composable
internal fun AppButton(
    mono: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = rounded(14.dp),
    interactionSource: MutableInteractionSource? = null,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    content: @Composable RowScope.() -> Unit
) {
    if (mono) {
        val fg = MaterialTheme.colorScheme.onBackground
        val fill = monoFill()
        Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = ButtonDefaults.buttonColors(
                containerColor = fill,
                contentColor = fg,
                disabledContainerColor = fill.copy(alpha = 0.4f),
                disabledContentColor = fg.copy(alpha = 0.3f)
            ),
            border = BorderStroke(
                1.5.dp,
                MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) 0.7f else 0.2f)
            ),
            contentPadding = contentPadding,
            content = content
        )
    } else {
        Button(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = if (LocalPureMono.current) {
                val fg = MaterialTheme.colorScheme.onBackground
                ButtonDefaults.buttonColors(
                    containerColor = fg.copy(alpha = 0.14f),
                    contentColor = fg,
                    disabledContainerColor = fg.copy(alpha = 0.06f),
                    disabledContentColor = fg.copy(alpha = 0.3f)
                )
            } else colors,
            contentPadding = contentPadding,
            content = content
        )
    }
}

/** Scale modifier driven by a button's own [source], for Material buttons. */
@Composable
internal fun pressScaleModifier(
    source: MutableInteractionSource, pressedScale: Float = 0.9f
): Modifier {
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "pressScale"
    )
    return Modifier.scale(scale)
}

/** Clickable with no ripple and a bounce on press — for custom (non-button) elements. */
@Composable
internal fun Modifier.bounceClickable(
    enabled: Boolean = true, pressedScale: Float = 0.9f, onClick: () -> Unit
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "bounceClickable"
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = source, indication = null, enabled = enabled, onClick = onClick
        )
}

/** [bounceClickable] that also takes a long press. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.bounceCombinedClickable(
    pressedScale: Float = 0.9f, onLongClick: () -> Unit, onClick: () -> Unit
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "bounceCombinedClickable"
    )
    return this
        .scale(scale)
        .combinedClickable(
            interactionSource = source, indication = null,
            onLongClick = onLongClick, onClick = onClick
        )
}

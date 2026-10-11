package io.github.voidqubex.wifi_fan.ui.home

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.ui.components.bounceClickable
import io.github.voidqubex.wifi_fan.ui.components.bounceCombinedClickable
import io.github.voidqubex.wifi_fan.ui.theme.activeFill
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.onActiveFill

/**
 * One-tap scenes in a horizontally scrolling row, with a "+" chip at the end that saves the
 * current state. Long-pressing a scene opens its options. [edgePadding] lets the row scroll
 * to the screen edge while its first chip lines up with the cards.
 */
@Composable
internal fun SceneRow(
    scenes: List<Scene>,
    selectedId: Long?,
    candleHue: Int,
    canAdd: Boolean,
    edgePadding: Dp,
    onApply: (Scene) -> Unit,
    onLongPress: (Scene) -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
    /** Auto light's quick toggle, first in the row (null hides it). */
    autoOn: Boolean? = null,
    onAutoToggle: () -> Unit = {}
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .bleed(edgePadding)
            .horizontalScroll(rememberScrollState())
            .padding(PaddingValues(horizontal = edgePadding))
    ) {
        if (autoOn != null) AutoChip(autoOn, onAutoToggle)
        scenes.forEach { scene ->
            SceneChip(
                name = scene.name,
                swatch = scene.swatch(candleHue),
                selected = scene.id == selectedId,
                onClick = { onApply(scene) },
                onLongClick = { onLongPress(scene) }
            )
        }
        AddChip(enabled = canAdd, label = if (scenes.isEmpty()) "Save scene" else null, onClick = onAdd)
    }
}

/** Picks one of [scenes] (Settings > Auto light). */
@Composable
internal fun ScenePicker(
    scenes: List<Scene>,
    selectedId: Long,
    candleHue: Int,
    onPick: (Scene) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.horizontalScroll(rememberScrollState())
    ) {
        scenes.forEach { scene ->
            SceneChip(
                name = scene.name,
                swatch = scene.swatch(candleHue),
                selected = scene.id == selectedId,
                onClick = { onPick(scene) },
                onLongClick = { onPick(scene) }
            )
        }
    }
}

/** Auto light on/off: filled while on, with a small ring-and-dot mark. */
@Composable
private fun AutoChip(on: Boolean, onClick: () -> Unit) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val bg by animateColorAsState(
        if (on) activeFill() else onBg.copy(alpha = 0.07f), tween(200), label = "autoBg"
    )
    val fg by animateColorAsState(
        if (on) onActiveFill() else onBg.copy(alpha = 0.85f), tween(200), label = "autoFg"
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .height(36.dp)
            .clip(circle())
            .background(bg)
            .bounceClickable(pressedScale = 0.94f, onClick = onClick)
            .padding(start = 10.dp, end = 14.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(14.dp).clip(circle()).border(1.5.dp, fg, circle())
        ) {
            Box(Modifier.size(6.dp).clip(circle()).background(if (on) fg else fg.copy(alpha = 0.35f)))
        }
        Spacer(Modifier.width(8.dp))
        Text(
            "Auto",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
            color = fg,
            maxLines = 1
        )
    }
}

@Composable
private fun SceneChip(
    name: String,
    swatch: Brush,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val bg by animateColorAsState(
        if (selected) activeFill() else onBg.copy(alpha = 0.07f), tween(200), label = "sceneBg"
    )
    val fg by animateColorAsState(
        if (selected) onActiveFill() else onBg.copy(alpha = 0.85f), tween(200), label = "sceneFg"
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .height(36.dp)
            .clip(circle())
            .background(bg)
            .bounceCombinedClickable(pressedScale = 0.94f, onLongClick = onLongClick, onClick = onClick)
            .padding(start = 10.dp, end = 14.dp)
    ) {
        Box(
            Modifier
                .size(14.dp)
                .clip(circle())
                .background(swatch)
                .border(1.dp, Color.Black.copy(alpha = 0.15f), circle())
        )
        Spacer(Modifier.width(8.dp))
        Text(
            name,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 140.dp)
        )
    }
}

@Composable
private fun AddChip(enabled: Boolean, label: String?, onClick: () -> Unit) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val alpha = if (enabled) 0.7f else 0.3f
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .height(36.dp)
            .clip(circle())
            .border(1.dp, onBg.copy(alpha = 0.14f), circle())
            .bounceClickable(pressedScale = 0.92f, onClick = onClick)
            .padding(horizontal = if (label == null) 10.dp else 12.dp)
    ) {
        Icon(
            painter = painterResource(R.drawable.add),
            contentDescription = "Save the current light as a scene",
            modifier = Modifier.size(16.dp),
            tint = onBg.copy(alpha = alpha)
        )
        if (label != null) {
            Spacer(Modifier.width(6.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, color = onBg.copy(alpha = alpha))
        }
    }
}

/** Widens the element by [pad] on both sides, past its parent's padding, to the screen edges. */
private fun Modifier.bleed(pad: Dp) = layout { measurable, constraints ->
    val extra = (pad * 2).roundToPx()
    val wide = if (constraints.hasBoundedWidth) {
        constraints.copy(minWidth = constraints.maxWidth + extra, maxWidth = constraints.maxWidth + extra)
    } else constraints
    val p = measurable.measure(wide)
    val w = if (constraints.hasBoundedWidth) constraints.maxWidth else p.width
    layout(w, p.height) { p.place(-extra / 2, 0) }
}

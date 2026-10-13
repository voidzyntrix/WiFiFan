package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import io.github.voidqubex.wifi_fan.ui.theme.LocalPureMono
import io.github.voidqubex.wifi_fan.ui.theme.activeFill
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.onActiveFill
import io.github.voidqubex.wifi_fan.ui.theme.rounded

/** One pill split into [options]; the selected one is filled by a sliding thumb (-1 = none). */
@Composable
internal fun SegmentedPill(
    options: List<String>,
    selected: Int,
    modifier: Modifier = Modifier,
    onSelect: (Int) -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val haptics = rememberHaptics()
    val thumb by animateFloatAsState(
        selected.coerceAtLeast(0).toFloat(),
        spring(stiffness = Spring.StiffnessMediumLow), label = "pillThumb"
    )
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(40.dp)
            .glass(rounded(20.dp), onBg.copy(alpha = 0.08f), 20.dp)
    ) {
        val seg = maxWidth / options.size
        if (selected >= 0) {
            Box(
                Modifier
                    .offset(x = seg * thumb)
                    .width(seg)
                    .fillMaxHeight()
                    .padding(3.dp)
                    .glass(rounded(17.dp), activeFill(), 17.dp)
            )
        }
        Row(Modifier.fillMaxSize()) {
            options.forEachIndexed { i, label ->
                val fg by animateColorAsState(
                    if (i == selected) onActiveFill() else onBg.copy(alpha = 0.7f),
                    tween(200), label = "pillFg"
                )
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) { if (i != selected) { haptics.tap(); onSelect(i) } }
                ) {
                    FitText(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        color = fg,
                        modifier = Modifier.padding(horizontal = 3.dp)
                    )
                }
            }
        }
    }
}

/** On/off switch in the app's style; track and knob follow the corner setting. */
@Composable
internal fun AppSwitch(checked: Boolean, onChange: (Boolean) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val haptics = rememberHaptics()
    val pos by animateFloatAsState(
        if (checked) 1f else 0f, spring(stiffness = Spring.StiffnessMediumLow), label = "switchPos"
    )
    val track by animateColorAsState(
        if (!checked) cs.onBackground.copy(alpha = 0.14f)
        else if (LocalPureMono.current) cs.onBackground.copy(alpha = 0.38f) else cs.primary,
        tween(200), label = "switchTrack"
    )
    val knob by animateColorAsState(
        if (!checked) cs.onBackground.copy(alpha = 0.7f)
        else if (LocalPureMono.current) cs.onBackground else cs.onPrimary,
        tween(200), label = "switchKnob"
    )
    Box(
        Modifier
            .size(width = 50.dp, height = 30.dp)
            .glass(circle(), track)
            .bounceClickable(pressedScale = 0.92f) { haptics.tap(); onChange(!checked) }
            .padding(4.dp)
    ) {
        Box(
            Modifier
                .offset(x = 20.dp * pos)
                .size(22.dp)
                .glass(circle(), knob)
        )
    }
}

/** Three dots lighting up in turn: "still scanning". */
@Composable
internal fun ScanDots() {
    val t by rememberInfiniteTransition(label = "scanDots").animateFloat(
        initialValue = 0f, targetValue = 3f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
        label = "scanPhase"
    )
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(3) { i ->
            val d = ((t - i) % 3f + 3f) % 3f
            Box(
                Modifier
                    .size(6.dp)
                    .clip(circle())
                    .background(
                        MaterialTheme.colorScheme.primary.copy(alpha = if (d < 1f) 1f - 0.7f * d else 0.3f)
                    )
            )
        }
    }
}

/** Narrow phone (under 380 dp wide): tighter padding and smaller decorations. */
@Composable
internal fun isCompact() = LocalConfiguration.current.screenWidthDp < 380

@Composable
internal fun screenPadding() = if (isCompact()) 14.dp else 20.dp

/** One line of text that shrinks a little (down to 80 %) rather than wrapping or cutting off. */
@Composable
internal fun FitText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    fontWeight: FontWeight? = null
) {
    var scale by remember(text, style) { mutableFloatStateOf(1f) }
    var settled by remember(text, style) { mutableStateOf(false) }
    Text(
        text,
        color = color,
        fontWeight = fontWeight,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Ellipsis,
        style = if (style.fontSize.isSpecified) style.copy(fontSize = style.fontSize * scale) else style,
        modifier = modifier.drawWithContent { if (settled) drawContent() },
        onTextLayout = {
            val overflow = it.hasVisualOverflow || (it.lineCount > 0 && it.isLineEllipsized(0))
            if (overflow && scale > 0.8f) scale = (scale - 0.05f).coerceAtLeast(0.8f) else settled = true
        }
    )
}

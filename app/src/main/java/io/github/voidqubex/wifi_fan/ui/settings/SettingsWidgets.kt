package io.github.voidqubex.wifi_fan.ui.settings

import android.graphics.Color as AndroidColor
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.ui.components.AppSwitch
import io.github.voidqubex.wifi_fan.ui.components.PanelCard
import io.github.voidqubex.wifi_fan.ui.components.bounceClickable
import io.github.voidqubex.wifi_fan.ui.components.drawDot
import io.github.voidqubex.wifi_fan.ui.components.isCompact
import io.github.voidqubex.wifi_fan.ui.theme.AccentPresets
import io.github.voidqubex.wifi_fan.ui.theme.LocalPureMono
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.rounded

@Composable
internal fun AccentColorPicker(selected: Int, onPick: (Int) -> Unit) {
    SettingHeading("Accent", "Pick a preset or drag for any shade")

    // Preset swatches
    Row(
        modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween
    ) {
        AccentPresets.forEach { c ->
            val argb = c.toArgb()
            val isSel = argb == selected
            val ring by animateDpAsState(if (isSel) 3.dp else 1.dp, tween(200), label = "accentRing")
            Box(
                modifier = Modifier
                    .size(if (isCompact()) 26.dp else 30.dp)
                    .clip(circle())
                    .background(c)
                    .border(
                        width = ring,
                        color = if (isSel) MaterialTheme.colorScheme.onBackground
                        else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.10f),
                        shape = circle()
                    )
                    .bounceClickable(pressedScale = 0.85f) { onPick(argb) })
        }
    }

    Spacer(Modifier.height(16.dp))

    // Custom hue spectrum
    HueSlider(
        selected = Color(selected),
        onPick = { onPick(it.toArgb()) },
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun HueSlider(
    selected: Color, onPick: (Color) -> Unit, modifier: Modifier = Modifier
) {
    var widthPx by remember { mutableIntStateOf(1) }
    val hsv = remember(selected) {
        FloatArray(3).also { AndroidColor.colorToHSV(selected.toArgb(), it) }
    }
    val hue = hsv[0]
    val rainbow = remember {
        listOf(
            Color(0xFFFF0000),
            Color(0xFFFFFF00),
            Color(0xFF00FF00),
            Color(0xFF00FFFF),
            Color(0xFF0000FF),
            Color(0xFFFF00FF),
            Color(0xFFFF0000)
        )
    }

    fun pick(x: Float) {
        val h = (x / widthPx.toFloat()).coerceIn(0f, 1f) * 360f
        val argb = AndroidColor.HSVToColor(floatArrayOf(h, 0.65f, 0.90f))
        onPick(Color(argb))
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(28.dp)
            .clip(rounded(14.dp))
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    pick(down.position.x)
                    down.consume()
                    drag(down.id) { c -> pick(c.position.x); c.consume() }
                }
            }) {
        drawRect(brush = Brush.horizontalGradient(rainbow))
        val r = size.height / 2f
        val tx = (hue / 360f * size.width).coerceIn(r, size.width - r)
        drawDot(Color.White, radius = r - 2.dp.toPx(), center = Offset(tx, size.height / 2f))
        drawDot(selected, radius = r - 5.dp.toPx(), center = Offset(tx, size.height / 2f))
    }
}

/** A frosted card whose title row minimises the settings inside it. */
@Composable
internal fun SettingsCard(
    title: String,
    expanded: Boolean,
    modifier: Modifier = Modifier,
    onToggle: () -> Unit,
    badge: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    val arrow by animateFloatAsState(if (expanded) 90f else -90f, tween(250), label = "cardArrow")
    PanelCard(modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(rounded(12.dp))
                .bounceClickable(pressedScale = 0.98f, onClick = onToggle)
                .padding(vertical = 2.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (badge) {
                Spacer(Modifier.width(8.dp))
                UpdateDot()
            }
            Spacer(Modifier.weight(1f))
            Icon(
                painter = painterResource(R.drawable.arrow_back),
                contentDescription = if (expanded) "Minimise $title" else "Expand $title",
                modifier = Modifier.size(18.dp).rotate(arrow),
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }
        androidx.compose.animation.AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(tween(200)) + androidx.compose.animation.expandVertically(tween(300)),
            exit = fadeOut(tween(150)) + androidx.compose.animation.shrinkVertically(tween(250))
        ) {
            Column {
                Spacer(Modifier.height(16.dp))
                content()
            }
        }
    }
}

/** The "update available" dot next to a title. */
@Composable
internal fun UpdateDot() {
    Box(Modifier.size(8.dp).clip(circle()).background(MaterialTheme.colorScheme.primary))
}

@Composable
internal fun SettingGap() = Spacer(Modifier.height(24.dp))

/** Between two switches in a list. */
@Composable
internal fun SwitchGap() = Spacer(Modifier.height(16.dp))

/**
 * A sub-category inside a settings card: a small caps label and a hairline. Only visual; it
 * brings its own space above, so it replaces a [SettingGap] ([first] for the top of a card).
 */
@Composable
internal fun SettingSection(title: String, first: Boolean = false) {
    val color = if (LocalPureMono.current) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
    else MaterialTheme.colorScheme.primary
    if (!first) Spacer(Modifier.height(32.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.2.sp,
            color = color
        )
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
        )
    }
    Spacer(Modifier.height(14.dp))
}

@Composable
internal fun SettingHeading(title: String, subtitle: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onBackground
    )
    Spacer(Modifier.height(2.dp))
    Text(
        text = subtitle,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
    )
    Spacer(Modifier.height(12.dp))
}

@Composable
internal fun SettingSwitch(
    title: String,
    subtitle: String?,
    checked: Boolean,
    onChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        AppSwitch(checked = checked, onChange = onChange)
    }
}

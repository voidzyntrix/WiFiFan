package io.github.voidqubex.wifi_fan.ui.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.ui.components.GradientBar
import io.github.voidqubex.wifi_fan.ui.components.PanelCard
import io.github.voidqubex.wifi_fan.ui.components.SegmentedPill
import io.github.voidqubex.wifi_fan.ui.components.SliderLabel
import io.github.voidqubex.wifi_fan.ui.settings.PillButton
import io.github.voidqubex.wifi_fan.ui.theme.activeFill
import io.github.voidqubex.wifi_fan.ui.theme.rounded

/** Music mode controls: live level meter, sensitivity and the colour behaviour. */
@Composable
internal fun MusicPanel(
    level: Float,
    sensitivity: Float,
    onSensitivity: (Float) -> Unit,
    onSensitivityDone: () -> Unit,
    keepColour: Boolean,
    onKeepColour: (Boolean) -> Unit,
    micAllowed: Boolean,
    modifier: Modifier = Modifier
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val shown by animateFloatAsState(level.coerceIn(0f, 1f), tween(60), label = "musicLevel")
    PanelCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Music",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = onBg,
                modifier = Modifier.weight(1f)
            )
            Text(
                if (micAllowed) "Listening" else "Microphone off",
                style = MaterialTheme.typography.labelLarge,
                color = onBg.copy(alpha = 0.6f)
            )
        }
        Spacer(Modifier.height(10.dp))
        LevelMeter(shown)
        Spacer(Modifier.height(12.dp))
        SliderLabel("Sensitivity")
        GradientBar(
            fraction = sensitivity,
            stops = listOf(onBg.copy(alpha = 0.12f), onBg.copy(alpha = 0.55f)),
            thumbColor = MaterialTheme.colorScheme.primary,
            onFraction = onSensitivity,
            onFinished = onSensitivityDone
        )
        Spacer(Modifier.height(12.dp))
        SegmentedPill(listOf("Beat colours", "My colour"), if (keepColour) 1 else 0) {
            onKeepColour(it == 1)
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "Keeps listening when you leave the app. Stop it from its notification or by picking another mode.",
            style = MaterialTheme.typography.bodySmall,
            color = onBg.copy(alpha = 0.5f)
        )
    }
}

/** The bar that shows how loud it is right now. */
@Composable
private fun LevelMeter(level: Float) {
    val onBg = MaterialTheme.colorScheme.onBackground
    Box(
        Modifier
            .fillMaxWidth()
            .height(10.dp)
            .clip(rounded(5.dp))
            .background(onBg.copy(alpha = 0.08f))
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(level)
                .clip(rounded(5.dp))
                .background(activeFill(strong = true))
        )
    }
}

/** Visualizer controls: level meter, sensitivity, and a button to stop it. */
@Composable
internal fun VisualizerPanel(
    level: Float,
    running: Boolean,
    sensitivity: Float,
    onSensitivity: (Float) -> Unit,
    onSensitivityDone: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val shown by animateFloatAsState(level.coerceIn(0f, 1f), tween(60), label = "visualizerLevel")
    PanelCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Visualizer",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = onBg,
                modifier = Modifier.weight(1f)
            )
            Text(
                if (running) "Listening to your phone" else "Starting…",
                style = MaterialTheme.typography.labelLarge,
                color = onBg.copy(alpha = 0.6f)
            )
        }
        Spacer(Modifier.height(10.dp))
        LevelMeter(shown)
        Spacer(Modifier.height(12.dp))
        SliderLabel("Sensitivity")
        GradientBar(
            fraction = sensitivity,
            stops = listOf(onBg.copy(alpha = 0.12f), onBg.copy(alpha = 0.55f)),
            thumbColor = MaterialTheme.colorScheme.primary,
            onFraction = onSensitivity,
            onFinished = onSensitivityDone
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "Bass is red, mids green, treble blue. Plays along with music and videos from apps that allow " +
                "audio capture (Netflix and a few others block it). Keeps running with the app closed.",
            style = MaterialTheme.typography.bodySmall,
            color = onBg.copy(alpha = 0.5f)
        )
        Spacer(Modifier.height(12.dp))
        PillButton("Stop visualizer", highlighted = false, onClick = onStop)
    }
}

/** Screen sync status, with a button to stop it. */
@Composable
internal fun ScreenSyncPanel(running: Boolean, onStop: () -> Unit, modifier: Modifier = Modifier) {
    val onBg = MaterialTheme.colorScheme.onBackground
    PanelCard(modifier) {
        Text(
            "Screen sync",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = onBg
        )
        Spacer(Modifier.height(6.dp))
        Text(
            if (running) "The LED follows the colours on your screen, also while other apps are open."
            else "Starting screen capture…",
            style = MaterialTheme.typography.bodySmall,
            color = onBg.copy(alpha = 0.6f)
        )
        Spacer(Modifier.height(12.dp))
        PillButton("Stop screen sync", highlighted = false, onClick = onStop)
    }
}

package io.github.voidqubex.wifi_fan

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

@Composable
fun RowScope.ModeCard(
    title: String,
    icon: Int,
    selected: Boolean,
    enabled: Boolean,
    mono: Boolean = false,
    height: Int = 80,
    onClick: () -> Unit
) {
    val cs = MaterialTheme.colorScheme

    // In monochrome a selected card stays neutral (high-contrast) and only the
    // accent rims it; in colored mode the accent fills it.
    val animatedContainerColor by animateColorAsState(
        targetValue = when {
            selected && mono -> cs.onBackground
            selected         -> cs.primary
            else             -> cs.surfaceVariant
        },
        animationSpec = tween(durationMillis = 250),
        label = "containerColor"
    )

    val animatedContentColor by animateColorAsState(
        targetValue = when {
            selected && mono -> cs.background
            selected         -> cs.onPrimary
            else             -> cs.onSurfaceVariant
        },
        animationSpec = tween(durationMillis = 250),
        label = "contentColor"
    )

    val source  = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue   = if (pressed && enabled) 0.94f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label         = "modeCardScale"
    )

    Card(
        modifier = Modifier
            .weight(1f)
            .height(height.dp)
            .scale(scale),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = animatedContainerColor,
            contentColor = animatedContentColor,
            disabledContainerColor = animatedContainerColor.copy(alpha = 0.4f),
            disabledContentColor = animatedContentColor.copy(alpha = 0.4f),
        ),
        border = if (mono && selected) BorderStroke(1.5.dp, cs.primary) else null,
        enabled = enabled,
        interactionSource = source,
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(height.dp)
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                painter = painterResource(icon),
                contentDescription = title,
                modifier = Modifier.size(22.dp)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = title, style = MaterialTheme.typography.labelMedium)
        }
    }
}

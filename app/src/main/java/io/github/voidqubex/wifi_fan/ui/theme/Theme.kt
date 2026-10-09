package io.github.voidqubex.wifi_fan.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext

private val FallbackDark = darkColorScheme(
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVar,
    onBackground = DarkOnBg,
    onSurface = DarkOnBg,
    onSurfaceVariant = DarkOnBgMuted,
)

private val FallbackLight = lightColorScheme(
    background = LightBackground,
    surface = LightSurface,
    surfaceVariant = LightSurfaceVar,
    onBackground = LightOnBg,
    onSurface = LightOnBg,
    onSurfaceVariant = LightOnBgMuted,
)

/**
 * "Colored" scheme — a full-color look built around a user-chosen [accent].
 * Backgrounds stay on the Material baseline; primary/secondary/tertiary all
 * adopt the accent so the whole app picks up the chosen hue.
 */
private fun coloredScheme(accent: Color, dark: Boolean): ColorScheme {
    val onAccent = if (accent.luminance() > 0.5f) Color.Black else Color.White
    return if (dark) {
        darkColorScheme(
            primary = accent, onPrimary = onAccent,
            secondary = accent, onSecondary = onAccent,
            tertiary = accent, onTertiary = onAccent,
            primaryContainer = accent.copy(alpha = 0.30f),
            onPrimaryContainer = Color.White,
        )
    } else {
        lightColorScheme(
            primary = accent, onPrimary = onAccent,
            secondary = accent, onSecondary = onAccent,
            tertiary = accent, onTertiary = onAccent,
            primaryContainer = accent.copy(alpha = 0.18f),
            onPrimaryContainer = accent,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WiFiFanTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    colored: Boolean = false,
    accent: Color = DefaultAccent,
    content: @Composable () -> Unit
) {
    val colorScheme = if (colored) {
        coloredScheme(accent, darkTheme)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        val base = if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        // Keep Material You accent colors (primary/secondary/tertiary) but force our
        // monochrome/sepia backgrounds so the design intent is always preserved.
        if (darkTheme) {
            base.copy(
                background = DarkBackground,
                surface = DarkSurface,
                surfaceVariant = DarkSurfaceVar,
                onBackground = DarkOnBg,
                onSurface = DarkOnBg,
                onSurfaceVariant = DarkOnBgMuted,
                surfaceContainer = DarkSurface,
                surfaceContainerLow = DarkBackground,
                surfaceContainerHigh = DarkSurfaceVar,
                surfaceContainerLowest = DarkBackground,
                surfaceContainerHighest = DarkSurfaceVar,
            )
        } else {
            base.copy(
                background = LightBackground,
                surface = LightSurface,
                surfaceVariant = LightSurfaceVar,
                onBackground = LightOnBg,
                onSurface = LightOnBg,
                onSurfaceVariant = LightOnBgMuted,
                surfaceContainer = LightSurface,
                surfaceContainerLow = LightBackground,
                surfaceContainerHigh = LightSurfaceVar,
                surfaceContainerLowest = LightBackground,
                surfaceContainerHighest = LightSurfaceVar,
            )
        }
    } else {
        if (darkTheme) FallbackDark else FallbackLight
    }

    // Disable the default Material ripple app-wide; presses get custom scale feedback.
    CompositionLocalProvider(LocalRippleConfiguration provides null) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}

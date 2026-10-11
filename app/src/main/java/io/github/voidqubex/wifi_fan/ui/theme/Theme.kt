package io.github.voidqubex.wifi_fan.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext

/** Look options from Settings that apply to the whole app; changing them recomposes live. */
object AppLook {
    var monoFont by mutableStateOf(false)
    /** Multiplier for every corner radius (0 = square). */
    var cornerScale by mutableFloatStateOf(1f)
}

/** Corner multipliers for the Settings choices Square, Small, Medium, Large. */
val CornerScales = listOf(0f, 0.5f, 1f, 1.6f)

/** A rounded shape that follows the app's corner setting. */
fun rounded(radius: Dp) = RoundedCornerShape(radius * AppLook.cornerScale)

/**
 * Everything that would be a circle (buttons, dots, thumbs, pills): fully round at 100 %
 * and above, squarer below, square at 0.
 */
fun circle(): Shape = RoundedCornerShape(CornerSize((50f * AppLook.cornerScale).coerceIn(0f, 50f)))

/** Corner radius for a drawn dot of [radius] px, matching [circle]. */
fun dotCorner(radius: Float) = radius * AppLook.cornerScale.coerceIn(0f, 1f)

/** Pure grayscale, Raycast style: no accent colour anywhere, white (or black) highlights. */
private fun monochromeScheme(dark: Boolean): ColorScheme = if (dark) {
    darkColorScheme(
        primary = Color(0xFFF2F2F2), onPrimary = Color(0xFF111111),
        primaryContainer = Color(0xFF2E2E2E), onPrimaryContainer = Color(0xFFF2F2F2),
        secondary = Color(0xFFBDBDBD), onSecondary = Color(0xFF111111),
        tertiary = Color(0xFFBDBDBD), onTertiary = Color(0xFF111111),
        background = Color(0xFF0E0E0E), onBackground = Color(0xFFF2F2F2),
        surface = Color(0xFF1A1A1A), onSurface = Color(0xFFF2F2F2),
        surfaceVariant = Color(0xFF262626), onSurfaceVariant = Color(0xFF8C8C8C),
        surfaceContainer = Color(0xFF1A1A1A), surfaceContainerLow = Color(0xFF141414),
        surfaceContainerHigh = Color(0xFF242424), surfaceContainerLowest = Color(0xFF0E0E0E),
        surfaceContainerHighest = Color(0xFF2E2E2E),
        outline = Color(0xFF3A3A3A), outlineVariant = Color(0xFF2A2A2A),
    )
} else {
    lightColorScheme(
        primary = Color(0xFF151515), onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFE2E2E2), onPrimaryContainer = Color(0xFF151515),
        secondary = Color(0xFF4A4A4A), onSecondary = Color(0xFFFFFFFF),
        tertiary = Color(0xFF4A4A4A), onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFF3F3F3), onBackground = Color(0xFF151515),
        surface = Color(0xFFFFFFFF), onSurface = Color(0xFF151515),
        surfaceVariant = Color(0xFFE8E8E8), onSurfaceVariant = Color(0xFF6E6E6E),
        surfaceContainer = Color(0xFFFFFFFF), surfaceContainerLow = Color(0xFFF7F7F7),
        surfaceContainerHigh = Color(0xFFEDEDED), surfaceContainerLowest = Color(0xFFFFFFFF),
        surfaceContainerHighest = Color(0xFFE5E5E5),
        outline = Color(0xFFC4C4C4), outlineVariant = Color(0xFFDDDDDD),
    )
}

private fun scaledShapes(k: Float) = Shapes(
    extraSmall = RoundedCornerShape(4.dp * k),
    small = RoundedCornerShape(8.dp * k),
    medium = RoundedCornerShape(12.dp * k),
    large = RoundedCornerShape(16.dp * k),
    extraLarge = RoundedCornerShape(28.dp * k)
)

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
    pureMono: Boolean = false,
    accent: Color = DefaultAccent,
    content: @Composable () -> Unit
) {
    val colorScheme = if (colored) {
        coloredScheme(accent, darkTheme)
    } else if (pureMono) {
        monochromeScheme(darkTheme)
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
            typography = if (AppLook.monoFont) MonoTypography else Typography,
            shapes = scaledShapes(AppLook.cornerScale),
            content = content
        )
    }
}

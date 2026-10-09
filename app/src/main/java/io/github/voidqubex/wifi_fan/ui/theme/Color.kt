package io.github.voidqubex.wifi_fan.ui.theme

import androidx.compose.ui.graphics.Color

// Dark mode — true monochrome charcoal
val DarkBackground   = Color(0xFF141414)
val DarkSurface      = Color(0xFF1F1F1F)
val DarkSurfaceVar   = Color(0xFF2C2C2C)
val DarkOnBg         = Color(0xFFE4E4E4)
val DarkOnBgMuted    = Color(0xFF8A8A8A)

// Light mode — warm sepia / off-white
val LightBackground  = Color(0xFFF5F0E8)
val LightSurface     = Color(0xFFEDE8DF)
val LightSurfaceVar  = Color(0xFFE2DBD0)
val LightOnBg        = Color(0xFF1E1A14)
val LightOnBgMuted   = Color(0xFF6B5F50)

// ---------------------------------------------------------------------------
// "Colored" scheme — accent is user-chosen. Default is the original purple.
// ---------------------------------------------------------------------------
val DefaultAccent = Color(0xFF7E57C2)

/** Quick-pick swatches shown in Settings. */
val AccentPresets = listOf(
    Color(0xFF7E57C2), // purple
    Color(0xFF5C6BC0), // indigo
    Color(0xFF42A5F5), // blue
    Color(0xFF26A69A), // teal
    Color(0xFF66BB6A), // green
    Color(0xFFFFCA28), // amber
    Color(0xFFFF7043), // deep orange
    Color(0xFFEC407A), // pink
)

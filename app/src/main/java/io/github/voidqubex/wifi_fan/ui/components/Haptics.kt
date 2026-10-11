package io.github.voidqubex.wifi_fan.ui.components

import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import io.github.voidqubex.wifi_fan.ui.theme.AppLook

/** The app's haptic feedback, silent when Settings > Haptics is off. */
internal class AppHaptics(private val view: View) {
    private fun play(type: Int) {
        if (AppLook.haptics) view.performHapticFeedback(type)
    }

    /** A light tick: one step of a slider. */
    fun tick() = play(HapticFeedbackConstants.CLOCK_TICK)

    /** A tap: toggles, pills, menu picks, colour dots. */
    fun tap() = play(HapticFeedbackConstants.CONTEXT_CLICK)

    /** A firmer confirm: power, applying or saving a scene. */
    fun confirm() = play(HapticFeedbackConstants.CONFIRM)

    /** A long press that opened something. */
    fun longPress() = play(HapticFeedbackConstants.LONG_PRESS)
}

@Composable
internal fun rememberHaptics(): AppHaptics {
    val view = LocalView.current
    return remember(view) { AppHaptics(view) }
}

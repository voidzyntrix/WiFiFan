package io.github.voidqubex.wifi_fan.ui.components

import android.os.VibrationAttributes
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import kotlin.math.roundToInt

/**
 * The app's haptic feedback, silent when Settings > Haptics is off, scaled by Settings > Haptic
 * strength. It drives the vibration motor itself: the system's own touch feedback (what
 * View.performHapticFeedback plays) is often switched off in Android's settings and has no strength.
 * Phones without a vibration motor fall back to the system feedback.
 */
internal class AppHaptics(private val view: View) {
    private val vibrator: Vibrator? =
        view.context.getSystemService(VibratorManager::class.java)?.defaultVibrator?.takeIf { it.hasVibrator() }

    /**
     * One buzz: the motor's [primitive] if it has it, at [base] x the chosen strength; else a short
     * pulse of about [pulseMs] with that strength as its amplitude, or as its length on motors that
     * only buzz at one amplitude.
     */
    private fun play(primitive: Int, base: Float, pulseMs: Long, fallbackType: Int) {
        if (!AppLook.haptics) return
        val motor = vibrator
        if (motor == null) {
            view.performHapticFeedback(fallbackType)
            return
        }
        val level = (base * AppLook.hapticStrength).coerceIn(0.05f, 1f)
        val effect = when {
            motor.areAllPrimitivesSupported(primitive) ->
                VibrationEffect.startComposition().addPrimitive(primitive, level).compose()
            motor.hasAmplitudeControl() ->
                VibrationEffect.createOneShot(pulseMs, (level * 255).roundToInt().coerceIn(1, 255))
            else ->
                VibrationEffect.createOneShot(
                    (pulseMs * (0.5f + level)).toLong().coerceAtLeast(6L), VibrationEffect.DEFAULT_AMPLITUDE
                )
        }
        runCatching {
            // Android 13+ files a vibration without a purpose under media vibration, which many
            // phones (e.g. on Android 15) have off; say it is touch feedback.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                motor.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
            } else {
                motor.vibrate(effect)
            }
        }
    }

    /** A light tick: one step of a slider. */
    fun tick() = play(VibrationEffect.Composition.PRIMITIVE_TICK, 0.6f, 10, HapticFeedbackConstants.CLOCK_TICK)

    /** A tap: toggles, pills, menu picks, colour dots. */
    fun tap() = play(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.8f, 18, HapticFeedbackConstants.CONTEXT_CLICK)

    /** A firmer confirm: power, applying or saving a scene. */
    fun confirm() = play(VibrationEffect.Composition.PRIMITIVE_CLICK, 1f, 30, HapticFeedbackConstants.CONFIRM)

    /** A long press that opened something. */
    fun longPress() = play(VibrationEffect.Composition.PRIMITIVE_THUD, 1f, 40, HapticFeedbackConstants.LONG_PRESS)
}

@Composable
internal fun rememberHaptics(): AppHaptics {
    val view = LocalView.current
    return remember(view) { AppHaptics(view) }
}

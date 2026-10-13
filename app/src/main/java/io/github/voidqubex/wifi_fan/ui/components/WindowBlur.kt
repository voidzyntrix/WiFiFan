package io.github.voidqubex.wifi_fan.ui.components

import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.positionOnScreen
import io.github.voidqubex.wifi_fan.ui.theme.AppLook
import io.github.voidqubex.wifi_fan.ui.theme.rounded
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindowProvider
import java.util.function.Consumer

/**
 * Real blur behind a dialog or popup window: Android's compositor blurs everything under the
 * window (the background, cards, the LED preview, whatever the screen shows), Android 12+.
 * Call it inside the dialog's or popup's content; [popup] says which kind of window it is.
 *
 * Returns whether the phone does the blur right now (it can be switched off, e.g. by battery
 * saver), so the window's surface can be see-through while it does and solid when it doesn't.
 */
@Composable
internal fun rememberWindowBlur(popup: Boolean = false, radius: Dp = 60.dp): Boolean {
    val view = LocalView.current
    val context = LocalContext.current
    val px = with(LocalDensity.current) { radius.roundToPx() }
    val wm = remember { context.getSystemService(WindowManager::class.java) }
    var enabled by remember { mutableStateOf(runCatching { wm.isCrossWindowBlurEnabled }.getOrDefault(false)) }
    DisposableEffect(view) {
        val listener = Consumer<Boolean> { enabled = it }
        runCatching { wm.addCrossWindowBlurEnabledListener(listener) }
        if (popup) {
            // A popup is a view added to the window manager; its params are live.
            val root = view.rootView
            (root.layoutParams as? WindowManager.LayoutParams)?.let { params ->
                params.flags = params.flags or WindowManager.LayoutParams.FLAG_BLUR_BEHIND
                params.blurBehindRadius = px
                runCatching { wm.updateViewLayout(root, params) }
            }
        } else {
            (view.parent as? DialogWindowProvider)?.window?.let { window ->
                window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                window.attributes = window.attributes.also { it.blurBehindRadius = px }
                window.setDimAmount(0.35f)
            }
        }
        onDispose { runCatching { wm.removeCrossWindowBlurEnabledListener(listener) } }
    }
    return enabled
}

/** Corner radius that makes [glass] refract a fully round element (it is capped at half the size). */
internal val ROUND = 999.dp

/**
 * Glass for any element: the live background behind it, blurred (or, with Refractive glass on,
 * sharp and bent at the rim), under a translucent [tint]. Works in the main screen, in dialogs
 * and in the mode menu alike: it lines the background up by the element's position on screen.
 * [corner] is the element's corner radius for the refraction ([ROUND] for pills and circles).
 */
@Composable
internal fun Modifier.glass(shape: Shape, tint: Color, corner: Dp = ROUND): Modifier {
    val blurLayer = LocalBlurLayer.current
    val backdrop = LocalBackdropLayer.current
    var pos by remember { mutableStateOf(Offset.Zero) }
    val base = this
        .onGloballyPositioned { pos = it.positionOnScreen() }
        .clip(shape)
    return if (AppLook.refractiveGlass) {
        base.refractiveBackdrop(backdrop, { pos }, corner * AppLook.cornerScale).background(tint)
    } else {
        base.drawBehind { if (blurLayer != null) translate(-pos.x, -pos.y) { drawLayer(blurLayer) } }
            .background(tint)
    }
}

/** [glass] for a card with rounded corners of [corner]. */
@Composable
internal fun Modifier.frosted(corner: Dp, tint: Color): Modifier = glass(rounded(corner), tint, corner)

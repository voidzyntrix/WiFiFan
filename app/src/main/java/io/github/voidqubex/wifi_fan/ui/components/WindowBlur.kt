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
internal fun rememberWindowBlur(popup: Boolean = false, radius: Dp = 28.dp): Boolean {
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
                window.setDimAmount(0.25f)   // the blur already sets the dialog apart
            }
        }
        onDispose { runCatching { wm.removeCrossWindowBlurEnabledListener(listener) } }
    }
    return enabled
}

/**
 * Frosted glass inside the app's window: the live background behind this element, blurred
 * (re-drawn every frame, so moving backgrounds move behind it too), under a translucent [tint].
 * Cards sit straight on the background, so that is exactly what is behind them.
 */
@Composable
internal fun Modifier.frosted(shape: Shape, tint: Color): Modifier {
    val blurLayer = LocalBlurLayer.current
    var pos by remember { mutableStateOf(Offset.Zero) }
    return this
        .onGloballyPositioned { pos = it.positionInRoot() }
        .clip(shape)
        .drawBehind { if (blurLayer != null) translate(-pos.x, -pos.y) { drawLayer(blurLayer) } }
        .background(tint)
}

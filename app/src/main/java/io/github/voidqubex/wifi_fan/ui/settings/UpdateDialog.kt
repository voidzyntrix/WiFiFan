package io.github.voidqubex.wifi_fan.ui.settings

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.voidqubex.wifi_fan.ota.AppUpdateState
import io.github.voidqubex.wifi_fan.ota.AppUpdater
import io.github.voidqubex.wifi_fan.ota.OtaManager
import io.github.voidqubex.wifi_fan.ota.OtaState
import io.github.voidqubex.wifi_fan.ui.components.DialogButtons
import io.github.voidqubex.wifi_fan.ui.components.DialogCard

/** An update the launch dialog offers: the board's firmware or the app, and the new version. */
internal data class UpdateOffer(val firmware: Boolean, val version: String)

/**
 * The launch dialog that offers an update. Process-wide, so turning the phone neither closes the
 * dialog nor asks again: each update is offered once per launch, and "Later" means "ask again
 * the next time the app is opened" (see [newLaunch]).
 */
internal object UpdatePrompt {
    var showing by mutableStateOf<UpdateOffer?>(null)
        private set
    private val asked = mutableSetOf<UpdateOffer>()

    /** Opens the dialog for the first update not asked about yet (the app before the board). */
    fun offer(appVersion: String?, firmwareVersion: String?) {
        if (showing != null) return
        val next = listOfNotNull(
            appVersion?.let { UpdateOffer(firmware = false, version = it) },
            firmwareVersion?.let { UpdateOffer(firmware = true, version = it) }
        ).firstOrNull { it !in asked } ?: return
        asked += next
        showing = next
    }

    fun close() {
        showing = null
    }

    /** The app was opened afresh (not turned): ask about the updates again. */
    fun newLaunch() {
        showing = null
        asked.clear()
    }
}

/** The open update offer as a dialog; nothing while none is open. */
@Composable
internal fun UpdatePromptDialog(otaManager: OtaManager, boardVersion: String?, isConnected: Boolean) {
    val offer = UpdatePrompt.showing ?: return
    if (offer.firmware) FirmwareUpdateDialog(otaManager, offer.version, boardVersion, isConnected)
    else AppUpdateDialog(offer.version)
}

@Composable
private fun AppUpdateDialog(version: String) {
    val context = LocalContext.current
    val state = AppUpdater.state.collectAsState().value
    val installed = remember { AppUpdater.installedVersion(context) }
    val allowInstalls = rememberAppInstallFlow(state)
    val offered = state is AppUpdateState.UpdateAvailable
    val needsPermission = state == AppUpdateState.NeedsPermission
    val progress = (state as? AppUpdateState.Downloading)?.takeIf { it.total > 0 }
        ?.let { it.read.toFloat() / it.total }

    UpdateDialogWindow(busy = state.busy) {
        UpdateDialogCard(
            title = when {
                state.busy -> "Updating Glow"
                state is AppUpdateState.Error -> "Update failed"
                needsPermission -> "One more step"
                else -> "Update available"
            },
            subtitle = "Glow v$installed → v$version",
            message = if (offered) {
                "Glow downloads the update, then Android asks you to confirm. " +
                    "The app closes when it's done; open it again."
            } else {
                appUpdateStatusText(state)
            },
            error = state is AppUpdateState.Error,
            working = state.busy,
            progress = progress,
            dismissLabel = if (offered || needsPermission) "Later" else "Close",
            actionLabel = when {
                offered -> "Update"
                needsPermission -> "Allow app updates"
                else -> null
            },
            onDismiss = UpdatePrompt::close,
            onAction = {
                when {
                    state is AppUpdateState.UpdateAvailable -> AppUpdater.startUpdate(context, state.release)
                    needsPermission -> allowInstalls()
                    else -> Unit
                }
            }
        )
    }
}

@Composable
private fun FirmwareUpdateDialog(
    otaManager: OtaManager,
    version: String,
    boardVersion: String?,
    isConnected: Boolean
) {
    val live = otaManager.state.collectAsState().value
    // The board restarting makes the app check again at once; keep what the update ended with.
    var outcome by remember { mutableStateOf<OtaState?>(null) }
    LaunchedEffect(live) {
        if (live is OtaState.Done || live is OtaState.Error) outcome = live
    }
    val state = outcome ?: live
    val offered = state is OtaState.UpdateAvailable
    val progress = (state as? OtaState.Uploading)?.takeIf { it.total > 0 }
        ?.let { it.sent.toFloat() / it.total }

    // Like the Settings card: keep the screen on while the board is written.
    val view = LocalView.current
    DisposableEffect(state.busy) {
        val was = view.keepScreenOn
        view.keepScreenOn = was || state.busy
        onDispose { view.keepScreenOn = was }
    }

    UpdateDialogWindow(busy = state.busy) {
        UpdateDialogCard(
            title = when {
                state.busy -> "Updating the board"
                state is OtaState.Done -> "Board updated"
                state is OtaState.Error -> "Update failed"
                else -> "Update available"
            },
            subtitle = "Board firmware " + (boardVersion?.let { "v$it → " } ?: "") + "v$version",
            message = if (offered) {
                "The app sends the new firmware over Bluetooth. Keep it open until it's done."
            } else {
                otaStatusText(state)
            },
            error = state is OtaState.Error,
            working = state.busy,
            progress = progress,
            dismissLabel = if (offered) "Later" else "Close",
            actionLabel = if (offered) "Update" else null,
            actionEnabled = isConnected,
            onDismiss = UpdatePrompt::close,
            onAction = {
                if (state is OtaState.UpdateAvailable) otaManager.startUpdate(state.release)
            }
        )
    }
}

/** The dialog window. While [busy] Back and taps outside do nothing: an update must not be cut short. */
@Composable
private fun UpdateDialogWindow(busy: Boolean, content: @Composable () -> Unit) {
    Dialog(
        onDismissRequest = { if (!busy) UpdatePrompt.close() },
        properties = DialogProperties(dismissOnBackPress = !busy, dismissOnClickOutside = !busy)
    ) { content() }
}

/**
 * The update dialog's card. While [working] it shows a progress bar ([progress] is 0..1, or null
 * while the length isn't known) instead of buttons. Otherwise: [dismissLabel] next to
 * [actionLabel], or [dismissLabel] alone when there is no action.
 */
@Composable
internal fun UpdateDialogCard(
    title: String,
    subtitle: String,
    message: String,
    error: Boolean = false,
    working: Boolean = false,
    progress: Float? = null,
    dismissLabel: String = "Later",
    actionLabel: String? = null,
    actionEnabled: Boolean = true,
    onDismiss: () -> Unit,
    onAction: () -> Unit = {}
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    DialogCard(title, subtitle) {
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = if (error) MaterialTheme.colorScheme.error else onBg.copy(alpha = 0.85f)
        )
        Spacer(Modifier.height(24.dp))
        when {
            working -> UpdateProgress(progress)
            actionLabel != null -> DialogButtons(
                dismiss = dismissLabel, confirm = actionLabel, confirmEnabled = actionEnabled,
                onDismiss = onDismiss, onConfirm = onAction
            )
            else -> PillButton(dismissLabel, highlighted = true, onClick = onDismiss)
        }
    }
}

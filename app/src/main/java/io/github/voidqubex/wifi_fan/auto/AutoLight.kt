package io.github.voidqubex.wifi_fan.auto

import android.bluetooth.BluetoothProfile
import android.content.Context
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import io.github.voidqubex.wifi_fan.sync.SyncHub
import io.github.voidqubex.wifi_fan.ui.home.LedState
import io.github.voidqubex.wifi_fan.ui.home.Scene
import io.github.voidqubex.wifi_fan.ui.home.SceneApplier
import io.github.voidqubex.wifi_fan.ui.home.ledState
import io.github.voidqubex.wifi_fan.ui.home.loadScenes
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

/** What the Auto light service reports while it runs. */
data class AutoStatus(
    val state: AutoState,
    /** Music, Visualizer or Screen sync drives the LED; Auto light waits. */
    val paused: Boolean,
    /** Name of the scene shown for [state] (null while Waiting). */
    val sceneName: String?
)

/**
 * Process-wide Auto light state shared by the home screen, Settings and [AutoLightService].
 * The setting lives in [SettingsStore]; the service runs while it is on and a board is connected.
 */
object AutoLight {
    /** The setting (the home screen loads it from [SettingsStore] when it opens). */
    val enabled = MutableStateFlow(false)

    /** Non-null while the service runs. */
    val status = MutableStateFlow<AutoStatus?>(null)

    /** Each LED state Auto light applied (a scene, or the restored light), so the home screen can follow. */
    internal val applied = MutableSharedFlow<LedState>(extraBufferCapacity = 4)

    val running: Boolean get() = status.value != null

    /**
     * Turns the setting on or off. On: the home screen starts the service (it has to be visible
     * for that). Off: the light from before Auto light acted comes back and the service stops.
     */
    fun setEnabled(context: Context, on: Boolean, ble: BleManager) {
        val store = SettingsStore(context)
        store.autoLight = on
        enabled.value = on
        if (!on) {
            restore(store, ble)
            AutoLightService.stop(context)
        }
    }

    /** The scene with [id], if it still exists. */
    internal fun scene(store: SettingsStore, id: Long): Scene? = store.loadScenes().firstOrNull { it.id == id }

    /** Remembers the light as it is, the first time Auto light is about to change it. */
    internal fun snapshotIfNeeded(store: SettingsStore) {
        if (store.autoSnapshot == null) {
            store.autoSnapshot = store.ledState().toScene(0, "Before auto light").toJson().toString()
        }
    }

    /**
     * Brings back the light from before Auto light first acted, then forgets it. Skipped while
     * another sync drives the LED (that is the light the user picked since). Without a board the
     * state is only saved, so the app shows it and sends it on the next change.
     */
    internal fun restore(store: SettingsStore, ble: BleManager) {
        val json = store.autoSnapshot ?: return
        store.autoSnapshot = null
        if (SyncHub.isActive()) return
        val scene = runCatching { Scene.fromJson(JSONObject(json)) }.getOrNull() ?: return
        val connected = ble.connectionState.value == BluetoothProfile.STATE_CONNECTED
        val (state, _) = SceneApplier.apply(scene, ble, store, send = connected)
        applied.tryEmit(state)
    }
}

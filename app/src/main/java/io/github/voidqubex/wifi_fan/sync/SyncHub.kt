package io.github.voidqubex.wifi_fan.sync

import kotlinx.coroutines.flow.MutableStateFlow

/** What the background sync services (music, visualizer, screen) can be doing. */
enum class SyncKind { NONE, MUSIC, VISUALIZER, SCREEN }

/**
 * Process-wide state shared by the home screen and the sync services. The services keep
 * running (and driving the LED) after the activity is gone; the screen just observes this.
 */
object SyncHub {
    /** Which sync is running right now. Set by the services. */
    val active = MutableStateFlow(SyncKind.NONE)

    /** Live values for the level meter and the LED preview. */
    val level = MutableStateFlow(0f)
    val hue = MutableStateFlow(0f)
    val sat = MutableStateFlow(1f)

    /** A service that couldn't start or had to stop leaves a message here; the screen shows it. */
    val error = MutableStateFlow<String?>(null)

    /** True while the activity exists; a service that stops after it is gone ends the Bluetooth link. */
    @Volatile var uiAlive = false

    fun isActive() = active.value != SyncKind.NONE

    /** Starts a service run with the picked colour showing and the meter at rest. */
    fun reset() {
        level.value = 0f
        hue.value = SyncParams.hue
        sat.value = SyncParams.sat
        error.value = null
    }
}

/** What the user picked in the app. The home screen keeps it current; the services read it live. */
object SyncParams {
    @Volatile var hue = 0f
    @Volatile var sat = 1f
    @Volatile var bri = 1f
    @Volatile var sensitivity = 0.5f
    @Volatile var keepColour = false
    /** Music and Visualizer: spike the brightness on each beat. */
    @Volatile var beatFlash = true
}

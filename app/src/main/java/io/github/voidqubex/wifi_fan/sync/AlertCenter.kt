package io.github.voidqubex.wifi_fan.sync

import android.bluetooth.BluetoothProfile
import android.os.SystemClock
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.battery.BatteryAlertPolicy
import io.github.voidqubex.wifi_fan.battery.BatteryAlertState
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What an alert asks the board to blink. Ordered by urgency: red beats green. */
enum class AlertKind { NONE, GREEN, RED }

/**
 * The board has one blink-alert slot (`alert=`), shared by everything that wants to warn: the
 * phone's battery, the FoxESS inverter. Each source states what it wants; the most urgent request
 * is sent, repeated once a minute (the board ends an alert by itself when the phone goes quiet, so
 * a dropped Bluetooth link stops it), and cancelled when nobody wants one. Green blinks last at
 * most 10 minutes per episode. It never connects or disconnects.
 */
object AlertCenter {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var app: GlowApp

    private val requests = mutableMapOf<String, AlertKind>()
    private var combined = AlertKind.NONE
    private var combinedSince = 0L
    private var sent = false

    fun start(app: GlowApp) {
        this.app = app
        val ble = app.bleManager
        scope.launch { ble.connectionState.collect { push() } }
        scope.launch { ble.firmwareVersion.collect { push() } }
        scope.launch {
            while (true) {
                delay(60_000)
                push()
            }
        }
    }

    /** [source] wants [kind] now (NONE withdraws its request). Safe from any thread. */
    fun set(source: String, kind: AlertKind) {
        scope.launch {
            requests[source] = kind
            push()
        }
    }

    fun command(kind: AlertKind): String = BatteryAlertPolicy.command(
        when (kind) {
            AlertKind.NONE -> BatteryAlertState.NONE
            AlertKind.GREEN -> BatteryAlertState.FULL
            AlertKind.RED -> BatteryAlertState.LOW
        }
    )

    private fun push() {
        val wanted = requests.values.maxOrNull() ?: AlertKind.NONE
        val now = SystemClock.elapsedRealtime()
        if (wanted != combined) {
            combined = wanted
            combinedSince = now
        }
        val ble = app.bleManager
        val capable = ble.connectionState.value == BluetoothProfile.STATE_CONNECTED &&
            ble.firmwareVersion.value?.let {
                GitHubReleases.compareVersions(it, BatteryAlertPolicy.MIN_FIRMWARE) >= 0
            } == true
        if (!capable) {
            sent = false      // a dropped link ends the alert on the board by itself
            return
        }
        val expired = combined == AlertKind.GREEN &&
            now - combinedSince > BatteryAlertPolicy.FULL_MINUTES * 60_000L
        if (combined == AlertKind.NONE || expired) {
            if (sent) {
                ble.sendData(command(AlertKind.NONE))
                sent = false
            }
        } else {
            ble.sendData(command(combined))
            sent = true
        }
    }
}

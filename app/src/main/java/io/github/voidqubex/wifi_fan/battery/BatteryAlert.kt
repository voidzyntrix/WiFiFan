package io.github.voidqubex.wifi_fan.battery

import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Tells the board about the phone's battery: low (two red blinks a minute) and full (two green
 * blinks a minute for 10 minutes). The board does the blinking, over whatever it shows; the app
 * only sends the command when the state changes and repeats it every minute as a sign of life.
 * It never connects or disconnects: while no board is connected there is nothing to do, and the
 * board ends an alert by itself when the phone goes quiet.
 */
object BatteryAlert {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var app: GlowApp

    private var percent = 100
    private var plugged = false
    private var statusFull = false

    private var shown = BatteryAlertState.NONE
    private var shownSince = 0L
    private var sentToBoard = false

    fun start(app: GlowApp) {
        this.app = app
        ContextCompat.registerReceiver(
            app,
            object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    read(intent)
                    evaluate()
                }
            },
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )?.let { read(it) }
        val ble = app.bleManager
        scope.launch { ble.connectionState.collect { evaluate() } }
        scope.launch { ble.firmwareVersion.collect { evaluate() } }
        scope.launch {
            while (true) {
                delay(60_000)
                evaluate()
            }
        }
    }

    /** Settings changed: apply it now. */
    fun refresh() {
        scope.launch { evaluate() }
    }

    private fun read(intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        if (level >= 0 && scale > 0) percent = level * 100 / scale
        plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        statusFull = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1) == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun evaluate() {
        val store = SettingsStore(app)
        val wanted = BatteryAlertPolicy.state(
            percent, plugged, statusFull, store.batteryLowAlert, store.batteryFullAlert
        )
        val now = SystemClock.elapsedRealtime()
        if (wanted != shown) {
            shown = wanted
            shownSince = now
        }
        val ble = app.bleManager
        val capable = ble.connectionState.value == BluetoothProfile.STATE_CONNECTED &&
            ble.firmwareVersion.value?.let {
                GitHubReleases.compareVersions(it, BatteryAlertPolicy.MIN_FIRMWARE) >= 0
            } == true
        if (!capable) {
            sentToBoard = false      // a dropped link ends the alert on the board by itself
            return
        }
        val expired = shown == BatteryAlertState.FULL &&
            now - shownSince > BatteryAlertPolicy.FULL_MINUTES * 60_000L
        when {
            shown == BatteryAlertState.NONE || expired -> if (sentToBoard) {
                ble.sendData(BatteryAlertPolicy.command(BatteryAlertState.NONE))
                sentToBoard = false
            }
            else -> {
                ble.sendData(BatteryAlertPolicy.command(shown))
                sentToBoard = true
            }
        }
    }
}

package io.github.voidqubex.wifi_fan.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.core.content.ContextCompat
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.sync.AlertCenter
import io.github.voidqubex.wifi_fan.sync.AlertKind

/**
 * Watches the phone's battery and asks [AlertCenter] for the board's blinks: red below the chosen
 * level while not charging, green for 10 minutes when fully charged. The sending, the minute-by-
 * minute repeat and the connection checks are the center's job.
 */
object BatteryAlert {
    private lateinit var app: GlowApp

    private var percent = 100
    private var plugged = false
    private var statusFull = false

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
        evaluate()
    }

    /** Settings changed: apply it now. */
    fun refresh() = evaluate()

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
            percent, plugged, statusFull, store.batteryLowAlert, store.batteryFullAlert, store.batteryLowPercent
        )
        AlertCenter.set(
            "battery",
            when (wanted) {
                BatteryAlertState.LOW -> AlertKind.RED
                BatteryAlertState.FULL -> AlertKind.GREEN
                BatteryAlertState.NONE -> AlertKind.NONE
            }
        )
    }
}

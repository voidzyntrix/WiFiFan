package io.github.voidqubex.wifi_fan.bluetooth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import io.github.voidqubex.wifi_fan.GlowApp
import io.github.voidqubex.wifi_fan.MainActivity
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Keeps the app, and with it the board's Bluetooth link, alive while a board is connected: closing
 * or swiping away the app would otherwise let Android end the process and drop the connection.
 * Stops by itself when the board disconnects; its notification has a Disconnect button.
 */
class LinkService : Service() {
    private var scope: CoroutineScope? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val ble = (application as GlowApp).bleManager
        if (intent?.action == ACTION_DISCONNECT) {
            ble.disconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            startForeground(NOTIFICATION_ID, notification(ble), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (scope == null) {
            val s = CoroutineScope(SupervisorJob() + Dispatchers.Main)
            scope = s
            s.launch {
                ble.connectionState.collect { if (it == BluetoothProfile.STATE_DISCONNECTED) stopSelf() }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope?.cancel()
        scope = null
        super.onDestroy()
    }

    private fun notification(ble: BleManager): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Board connection", NotificationManager.IMPORTANCE_LOW)
        )
        val address = ble.deviceAddress.value
        val name = address?.let { SettingsStore(this).boardNames[it] } ?: ble.deviceName.value ?: "LED board"
        val disconnect = PendingIntent.getService(
            this, 11, Intent(this, LinkService::class.java).setAction(ACTION_DISCONNECT),
            PendingIntent.FLAG_IMMUTABLE
        )
        val open = PendingIntent.getActivity(
            this, 12, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.power)
            .setContentTitle("Connected to $name")
            .setContentText("Glow keeps the board connected while the app is closed")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Disconnect", disconnect).build())
            .build()
    }

    companion object {
        private const val ACTION_DISCONNECT = "io.github.voidqubex.wifi_fan.bluetooth.DISCONNECT"
        private const val CHANNEL = "board_link"
        private const val NOTIFICATION_ID = 12

        /** Call while the app is visible (Android only lets it start a foreground service then). */
        fun start(context: Context) {
            runCatching { context.startForegroundService(Intent(context, LinkService::class.java)) }
        }
    }
}

package io.github.voidqubex.wifi_fan

import android.app.Application
import io.github.voidqubex.wifi_fan.battery.BatteryAlert
import io.github.voidqubex.wifi_fan.bluetooth.BleManager

class GlowApp : Application() {
    /**
     * One Bluetooth link for the whole process. The sync services use it too, so the LED
     * stays connected and driven when the activity is gone.
     */
    val bleManager: BleManager by lazy { BleManager(this) }

    override fun onCreate() {
        super.onCreate()
        BatteryAlert.start(this)
    }
}

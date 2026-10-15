package io.github.voidqubex.wifi_fan.battery

/** What the phone's battery asks the board to show. */
enum class BatteryAlertState { NONE, LOW, FULL }

/** The rules, as plain Kotlin so they can be tested. */
object BatteryAlertPolicy {
    /** The default for "below this many percent (and not charging) the battery counts as low". */
    const val LOW_PERCENT = 20

    /** The green blinks of a full battery last this long. */
    const val FULL_MINUTES = 10

    /** Alerts need a board that knows the `alert=` command. */
    const val MIN_FIRMWARE = "1.8.0"

    fun state(
        percent: Int,
        plugged: Boolean,
        statusFull: Boolean,
        lowOn: Boolean,
        fullOn: Boolean,
        lowPercent: Int = LOW_PERCENT
    ): BatteryAlertState = when {
        lowOn && percent in 0 until lowPercent && !plugged -> BatteryAlertState.LOW
        fullOn && plugged && (statusFull || percent >= 100) -> BatteryAlertState.FULL
        else -> BatteryAlertState.NONE
    }

    /**
     * The board command for [state]: two blinks every 60 s (red with no end, green for 10 minutes).
     * The app repeats it every minute while the state holds: the board treats a repeat as a sign of
     * life and stops by itself when the phone goes quiet (Bluetooth dropped).
     */
    fun command(state: BatteryAlertState): String = when (state) {
        BatteryAlertState.NONE -> "alert=0"
        BatteryAlertState.LOW -> "alert=1/60/0"
        BatteryAlertState.FULL -> "alert=2/60/$FULL_MINUTES"
    }
}

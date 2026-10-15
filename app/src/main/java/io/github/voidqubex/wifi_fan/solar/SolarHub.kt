package io.github.voidqubex.wifi_fan.solar

import kotlinx.coroutines.flow.MutableStateFlow

/** What the Solar panel shows: the latest reading, when it came, and the last error (if any). */
data class SolarState(
    val reading: SolarReading? = null,
    val updatedAt: Long = 0L,
    val error: String? = null,
    val demo: Boolean = false
)

/** Process-wide state shared by [SolarSyncService] and the home screen. */
object SolarHub {
    val state = MutableStateFlow(SolarState())
}

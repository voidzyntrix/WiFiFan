package io.github.voidqubex.wifi_fan.ota

import android.util.Log
import io.github.voidqubex.wifi_fan.bluetooth.BleManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.CRC32

sealed interface OtaState {
    object Idle : OtaState
    object Checking : OtaState
    data class UpToDate(val latest: String) : OtaState
    data class UpdateAvailable(val release: FirmwareRelease) : OtaState
    object Downloading : OtaState
    object EnteringBootloader : OtaState
    data class Uploading(val sent: Int, val total: Int) : OtaState
    object Verifying : OtaState
    data class Done(val version: String) : OtaState
    data class Error(val message: String) : OtaState

    /** True while the board is being updated (don't let the user leave). */
    val busy: Boolean get() = this is Downloading || this is EnteringBootloader ||
        this is Uploading || this is Verifying
}

/**
 * Updates the fan board's firmware over the Bluetooth serial link.
 *
 * 1. send "ota"           -> the firmware restarts into its bootloader, which
 *                            announces itself with "BOOT,<ver>,<baud>,<max>"
 * 2. START{size, crc32}   -> "OK,START"   (the old firmware is invalidated)
 * 3. DATA{seq, 256 bytes} -> "OK,<seq>"   for every block, resent on errors
 * 4. END                  -> "DONE"       (CRC checked; board restarts into the new firmware)
 * 5. send "ver"           -> "VER,<new version>" confirms the update
 *
 * Frames are `A5 5A | cmd | len u16 | payload | crc32` (little-endian, CRC-32 as
 * java.util.zip.CRC32 over cmd..payload). An interrupted update leaves the board
 * in its bootloader (blue LED); starting the update again finishes it.
 * See the firmware's CH32V203C8U_Bootloader/User/main.c for the board side.
 */
class OtaManager(private val ble: BleManager, private val scope: CoroutineScope) {

    private val _state = MutableStateFlow<OtaState>(OtaState.Idle)
    val state: StateFlow<OtaState> = _state

    fun checkForUpdate(boardVersion: String?) {
        if (_state.value.busy || _state.value == OtaState.Checking) return
        scope.launch {
            _state.value = OtaState.Checking
            _state.value = try {
                val latest = FirmwareRepository.latest()
                when {
                    latest == null -> OtaState.Error("No firmware found in the GitHub releases")
                    boardVersion != null &&
                        GitHubReleases.compareVersions(latest.version, boardVersion) <= 0 ->
                        OtaState.UpToDate(latest.version)
                    else -> OtaState.UpdateAvailable(latest)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                OtaState.Error("Couldn't check for updates: ${e.message}")
            }
        }
    }

    fun startUpdate(release: FirmwareRelease) {
        if (_state.value.busy) return
        scope.launch {
            ble.quiet = true
            _state.value = try {
                runUpdate(release)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Update failed", e)
                OtaState.Error("Update failed: ${e.message}. Start it again to retry.")
            } finally {
                ble.quiet = false
            }
        }
    }

    private suspend fun runUpdate(release: FirmwareRelease): OtaState {
        _state.value = OtaState.Downloading
        val image = FirmwareRepository.download(release)

        // 1. Into the bootloader. If the board is already there (safe mode or an
        //    earlier interrupted update) it answers INFO instead of "ota".
        _state.value = OtaState.EnteringBootloader
        val boot = request(BOOT_TIMEOUT_MS, { ble.sendData("ota") }) { it.startsWith("BOOT,") }
            ?: request(BOOT_TIMEOUT_MS, { ble.writeRaw(frame(CMD_INFO)) }) { it.startsWith("BOOT,") }
            ?: throw IOException("the board didn't enter its bootloader (is the firmware too old for updates?)")
        // BOOT,<bootloader version>,<baud>,<max image size>
        val fields = boot.split(',')
        val baud = fields.getOrNull(2)?.toIntOrNull() ?: 9600
        val maxSize = fields.getOrNull(3)?.toIntOrNull() ?: FirmwareRepository.APP_MAX
        if (image.size > maxSize) throw IOException("firmware is larger than the board's $maxSize bytes")

        // 2. START
        val crc = CRC32().apply { update(image) }.value.toInt()
        transact(frame(CMD_START, le32(image.size) + le32(crc)), baud) { it == "OK,START" }

        // 3. DATA blocks
        val blocks = (image.size + BLOCK - 1) / BLOCK
        var seq = 0
        while (seq < blocks) {
            _state.value = OtaState.Uploading(seq * BLOCK, image.size)
            val data = image.copyOfRange(seq * BLOCK, minOf((seq + 1) * BLOCK, image.size))
            val reply = transact(frame(CMD_DATA, le16(seq) + data), baud) {
                it == "OK,$seq" || it.startsWith("ERR,SEQ,")
            }
            seq = if (reply.startsWith("ERR,SEQ,")) {
                reply.substringAfterLast(',').toInt()      // board expects another block: follow it
            } else {
                seq + 1
            }
        }
        _state.value = OtaState.Uploading(image.size, image.size)

        // 4. END. If "DONE" got lost the board has still restarted - step 5 tells.
        _state.value = OtaState.Verifying
        try {
            transact(frame(CMD_END), baud) { it == "DONE" }
        } catch (e: BoardError) {
            throw e                                         // e.g. ERR,CRC: the update did not take
        } catch (e: IOException) {
            Log.w(TAG, "No DONE (${e.message}); checking the version instead")
        }

        // 5. The new firmware should report the new version.
        delay(REBOOT_WAIT_MS)
        repeat(3) {
            val ver = request(VER_TIMEOUT_MS, { ble.sendData("ver") }) { it.startsWith("VER,") }
            if (ver != null) {
                val v = ver.substringAfter(',')
                return if (v == release.version) OtaState.Done(v)
                else OtaState.Error("The board reports version $v after the update, expected ${release.version}")
            }
        }
        throw IOException("the board didn't report its version after the update")
    }

    /**
     * Sends [frame] and returns the reply line accepted by [ok]. Garbled
     * frames ("ERR,FRAME") and missing replies are retried; any other "ERR,"
     * line is fatal.
     */
    private suspend fun transact(frame: ByteArray, baud: Int, ok: (String) -> Boolean): String {
        repeat(RETRIES) { attempt ->
            val reply = request(REPLY_TIMEOUT_MS, { ble.writeRaw(frame, baud) }) {
                ok(it) || it.startsWith("ERR,")
            }
            when {
                reply == null -> Log.w(TAG, "No reply (attempt ${attempt + 1})")
                ok(reply) -> return reply
                reply == "ERR,FRAME" -> Log.w(TAG, "Frame garbled on the way (attempt ${attempt + 1})")
                else -> throw BoardError("the board answered $reply")
            }
        }
        throw IOException("no answer from the board")
    }

    /**
     * Starts listening, then calls [send], then waits up to [timeoutMs] for a
     * line matching [match]. Listening first means a fast reply can't be missed.
     */
    private suspend fun request(
        timeoutMs: Long,
        send: suspend () -> Unit,
        match: (String) -> Boolean
    ): String? = coroutineScope {
        val reply = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeoutOrNull(timeoutMs) { ble.lines.first(match) }
        }
        send()
        reply.await()
    }

    /** The board refused something (an "ERR,..." reply), as opposed to no reply at all. */
    private class BoardError(message: String) : IOException(message)

    private fun frame(cmd: Int, payload: ByteArray = ByteArray(0)): ByteArray {
        val body = byteArrayOf(cmd.toByte()) + le16(payload.size) + payload
        val crc = CRC32().apply { update(body) }.value.toInt()
        return byteArrayOf(0xA5.toByte(), 0x5A) + body + le32(crc)
    }

    private fun le16(v: Int) = byteArrayOf(v.toByte(), (v shr 8).toByte())

    private fun le32(v: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

    private companion object {
        const val TAG = "OtaManager"
        const val CMD_START = 0x01
        const val CMD_DATA = 0x02
        const val CMD_END = 0x03
        const val CMD_INFO = 0x05
        const val BLOCK = 256
        const val RETRIES = 5
        const val BOOT_TIMEOUT_MS = 6_000L
        const val REPLY_TIMEOUT_MS = 4_000L       // per frame, sending it included (~0.5 s at 9600)
        const val VER_TIMEOUT_MS = 3_000L
        const val REBOOT_WAIT_MS = 1_500L         // bootloader start-up window + app start
    }
}

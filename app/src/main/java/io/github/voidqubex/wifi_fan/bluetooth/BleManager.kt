package io.github.voidqubex.wifi_fan.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.IOException
import java.util.UUID

@Suppress("PrivatePropertyName")
class BleManager(private val context: Context) {

    private val bluetoothManager: BluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val scanner get() = bluetoothAdapter?.bluetoothLeScanner
    private var bluetoothGatt: BluetoothGatt? = null

    // Starts as CONNECTED on purpose: lets the control UI run in the emulator,
    // which has no Bluetooth.
    private val _connectionState = MutableStateFlow(BluetoothProfile.STATE_CONNECTED)
    val connectionState: StateFlow<Int> = _connectionState

    private val _foundDevices = MutableStateFlow<Set<BluetoothDevice>>(emptySet())
    val foundDevices: StateFlow<Set<BluetoothDevice>> = _foundDevices

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning

    private val _isDataAvailable = MutableStateFlow(false)
    val isDataAvailable: StateFlow<Boolean> = _isDataAvailable

    private val _receivedData = MutableStateFlow("")
    val receivedData: StateFlow<String> = _receivedData

    // Every complete line from the board, in order. Unlike receivedData (a
    // StateFlow) this doesn't swallow a line that repeats the previous one,
    // which the firmware-update protocol relies on.
    private val _lines = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val lines: SharedFlow<String> = _lines

    // Board firmware version from its "VER,<x>" reply; null until it answered.
    private val _firmwareVersion = MutableStateFlow<String?>(null)
    val firmwareVersion: StateFlow<String?> = _firmwareVersion

    // While true (firmware update running) incoming lines don't pop toasts.
    @Volatile var quiet = false

    private val handler = Handler(Looper.getMainLooper())

    // Buffer for accumulating incoming bytes
    private val dataBuffer = java.io.ByteArrayOutputStream()

    // Delimiter: backslash (ASCII 92) – matches your device's "1 a\"
    private val delimiterByte = '\\'.code.toByte()   // <-- CHANGED

    // Character set for converting bytes to String (US_ASCII works for plain text)
    private var charset: java.nio.charset.Charset = Charsets.US_ASCII

    fun setCharset(charset: java.nio.charset.Charset) {
        this.charset = charset
    }

    private val SERVICE_UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb")
    private val CHARACTERISTIC_UUID = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb")
    private val NOTIFY_CHARACTERISTIC_UUID = UUID.fromString("0000ffe2-0000-1000-8000-00805f9b34fb")
    private val CLIENT_CHARACTERISTIC_CONFIG_UUID =
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    @SuppressLint("MissingPermission")
    fun startScanning() {
        if (_isScanning.value) {
            Log.d("BleManager", "Already scanning, ignoring request.")
            return
        }

        val currentScanner = scanner
        Log.d(
            "BleManager",
            "startScanning called. Adapter enabled: ${bluetoothAdapter?.isEnabled}, Scanner null: ${currentScanner == null}"
        )

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled || currentScanner == null) {
            Log.w("BleManager", "Cannot start scan: Adapter disabled or scanner null")
            Toast.makeText(context, "Bluetooth adapter null or disabled!", Toast.LENGTH_SHORT)
                .show()
            return
        }

        _foundDevices.value = emptySet()
        _isScanning.value = true

        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({
            stopScanning()
        }, 15000)

        val settings =
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()

        try {
            currentScanner.stopScan(scanCallback)
        } catch (_: Exception) {
            // Ignore
        }

        try {
            currentScanner.startScan(null, settings, scanCallback)
            Log.d("BleManager", "Scan started successfully with Low Latency mode")
        } catch (e: Exception) {
            Log.e("BleManager", "Error starting scan", e)
            _isScanning.value = false
            Toast.makeText(context, "Failed to start scan: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScanning() {
        if (_isScanning.value) {
            Log.d("BleManager", "Stopping scan")
            _isScanning.value = false
            try {
                scanner?.stopScan(scanCallback)
            } catch (e: Exception) {
                Log.e("BleManager", "Error stopping scan", e)
            }
        }
        handler.removeCallbacksAndMessages(null)
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            if (device != null) {
                val currentDevices = _foundDevices.value.toMutableSet()
                if (currentDevices.add(device)) {
                    _foundDevices.value = currentDevices
                }
            }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            val currentDevices = _foundDevices.value.toMutableSet()
            var added = false
            results.forEach { result ->
                if (result.device != null && currentDevices.add(result.device)) {
                    added = true
                }
            }
            if (added) {
                _foundDevices.value = currentDevices
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e("BleManager", "Scan failed with error: $errorCode")
            _isScanning.value = false
            handler.post {
                val reason = when (errorCode) {
                    SCAN_FAILED_ALREADY_STARTED -> "Already started"
                    SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "App registration failed. Try toggling Bluetooth off and on."
                    SCAN_FAILED_INTERNAL_ERROR -> "Internal error"
                    SCAN_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                    else -> "Unknown error ($errorCode)"
                }
                Toast.makeText(context, "Scan failed: $reason", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(address: String) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.e("BleManager", "Bluetooth is not enabled or supported")
            return
        }
        stopScanning()
        val device = bluetoothAdapter.getRemoteDevice(address)
        Log.d("BleManager", "Connecting to ${device.address}")
        // TRANSPORT_LE: without it some phones try classic Bluetooth first and
        // fail with status 133 on BLE-only modules.
        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    /** Send a command; the device's line delimiter (\) is appended. */
    fun sendData(data: String) {
        val finalData = data + "\\"
        Log.d("BleManager", "Trying to send data: $finalData")
        enqueueWrite(finalData.toByteArray(), pauseAfterMs = 0, job = null)
    }

    /**
     * Send raw bytes (no delimiter) and suspend until every chunk was written.
     * When [baud] is given, chunks are spaced so the module's UART (at that
     * baud rate) keeps up and its small buffer can't overflow.
     */
    suspend fun writeRaw(data: ByteArray, baud: Int = 0) {
        val job = CompletableDeferred<Unit>()
        val pauseMs = if (baud > 0) writeChunk * 13_000L / baud else 0L   // 10 bits/byte + 30 %
        enqueueWrite(data, pauseMs, job)
        try {
            job.await()
        } catch (e: CancellationException) {
            job.cancel()                       // queued chunks of this call are skipped
            throw e
        }
    }

    // -----------------------------------------------------------------------
    // GATT operation queue
    //
    // Android runs one GATT operation at a time; starting another before the
    // previous one's callback simply fails, which used to drop commands sent in
    // quick succession (e.g. while dragging the speed slider). Everything goes
    // through this queue on the main thread and the next operation starts from
    // the previous one's callback.
    // -----------------------------------------------------------------------

    private sealed class GattOp {
        class Write(
            val data: ByteArray,
            val pauseAfterMs: Long,
            val job: CompletableDeferred<Unit>?,   // shared by all chunks of one writeRaw()
            val last: Boolean
        ) : GattOp()

        class EnableNotify(val characteristic: BluetoothGattCharacteristic) : GattOp()
        object RequestMtu : GattOp()
    }

    private val gattHandler = Handler(Looper.getMainLooper())
    private val gattQueue = ArrayDeque<GattOp>()
    private var opInFlight: GattOp? = null
    private var pausing = false                           // spacing out paced writes
    private var startAttempts = 0

    @Volatile private var writeChunk = DEFAULT_CHUNK      // ATT payload per write: MTU - 3

    private val opTimeout = Runnable {
        Log.w("BleManager", "GATT operation timed out")
        finishOp(success = false) { true }
    }

    private fun enqueueWrite(data: ByteArray, pauseAfterMs: Long, job: CompletableDeferred<Unit>?) {
        gattHandler.post {
            val chunk = writeChunk
            var off = 0
            while (off < data.size) {
                val end = minOf(off + chunk, data.size)
                gattQueue.addLast(GattOp.Write(data.copyOfRange(off, end), pauseAfterMs, job, end == data.size))
                off = end
            }
            if (data.isEmpty()) job?.complete(Unit)
            runNext()
        }
    }

    private fun enqueue(op: GattOp) {
        gattHandler.post {
            gattQueue.addLast(op)
            runNext()
        }
    }

    @SuppressLint("MissingPermission")
    private fun runNext() {
        if (opInFlight != null || pausing) return
        val op = gattQueue.removeFirstOrNull() ?: return
        if (op is GattOp.Write && op.job?.isCompleted == true) {   // its call failed/cancelled
            runNext()
            return
        }
        val gatt = bluetoothGatt
        if (gatt == null) {
            failOp(op)
            clearQueue()
            return
        }

        opInFlight = op
        val started = when (op) {
            is GattOp.Write -> {
                val ch = gatt.getService(SERVICE_UUID)?.getCharacteristic(CHARACTERISTIC_UUID)
                if (ch == null) {
                    Log.e("BleManager", "Characteristic not found")
                    false
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    gatt.writeCharacteristic(
                        ch, op.data, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    ) == BluetoothStatusCodes.SUCCESS
                } else {
                    ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    @Suppress("DEPRECATION") ch.value = op.data
                    @Suppress("DEPRECATION") gatt.writeCharacteristic(ch)
                }
            }
            is GattOp.EnableNotify -> startEnableNotifications(gatt, op.characteristic)
            GattOp.RequestMtu -> gatt.requestMtu(REQUESTED_MTU)
        }

        if (started) {
            startAttempts = 0
            gattHandler.postDelayed(opTimeout, OP_TIMEOUT_MS)
        } else if (++startAttempts < MAX_START_ATTEMPTS) {
            // Stack busy (e.g. right after connecting): try the same op again shortly.
            opInFlight = null
            gattQueue.addFirst(op)
            gattHandler.postDelayed({ runNext() }, 20)
        } else {
            startAttempts = 0
            failOp(op)
            opInFlight = null
            runNext()
        }
    }

    /**
     * Called from GATT callbacks (any thread) when an operation completed.
     * [isMine] checks that the callback belongs to the operation in flight: a
     * module may e.g. start an MTU exchange on its own, and that callback must
     * not complete a pending write.
     */
    private fun finishOp(success: Boolean, isMine: (GattOp) -> Boolean) {
        gattHandler.post {
            val op = opInFlight ?: return@post
            if (!isMine(op)) return@post
            gattHandler.removeCallbacks(opTimeout)
            opInFlight = null
            if (!success) {
                failOp(op)
                runNext()
                return@post
            }
            if (op is GattOp.Write && op.last) op.job?.complete(Unit)
            val pause = (op as? GattOp.Write)?.pauseAfterMs ?: 0L
            if (pause > 0) {
                pausing = true
                gattHandler.postDelayed({ pausing = false; runNext() }, pause)
            } else {
                runNext()
            }
        }
    }

    private fun failOp(op: GattOp) {
        if (op is GattOp.Write) op.job?.completeExceptionally(IOException("Bluetooth write failed"))
    }

    private fun clearQueue() {
        gattHandler.removeCallbacks(opTimeout)
        opInFlight?.let { failOp(it) }
        opInFlight = null
        while (gattQueue.isNotEmpty()) failOp(gattQueue.removeFirst())
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d("BleManager", "onConnectionStateChange: status=$status, newState=$newState")
            _connectionState.value = newState
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i("BleManager", "Connected to GATT server.")
                gatt.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i("BleManager", "Disconnected from GATT server.")
                gatt.close()
                if (gatt == bluetoothGatt) {
                    bluetoothGatt = null
                }
                dataBuffer.reset()
                _firmwareVersion.value = null
                gattHandler.post {
                    clearQueue()
                    writeChunk = DEFAULT_CHUNK
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i("BleManager", "Services discovered.")

                // Bigger packets if the module supports it (many only do 23 -> 20 bytes).
                enqueue(GattOp.RequestMtu)

                val uartService = gatt.getService(SERVICE_UUID)
                if (uartService != null) {
                    val notifyChar = uartService.getCharacteristic(NOTIFY_CHARACTERISTIC_UUID)
                    if (notifyChar != null) {
                        if (notifyChar.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) {
                            enqueue(GattOp.EnableNotify(notifyChar))
                        } else {
                            Log.e("BleManager", "ffe2 does not support notify (unexpected)")
                        }
                    } else {
                        Log.e("BleManager", "Notification characteristic ffe2 not found")
                    }

                    val sendChar = uartService.getCharacteristic(CHARACTERISTIC_UUID)
                    if (sendChar == null) {
                        Log.e("BleManager", "Send characteristic ffe1 not found")
                    }
                } else {
                    Log.e("BleManager", "UART service ffe0 not found")
                }
            } else {
                Log.w("BleManager", "onServicesDiscovered received: $status")
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                writeChunk = (mtu - 3).coerceIn(DEFAULT_CHUNK, MAX_CHUNK)
                Log.i("BleManager", "MTU $mtu -> $writeChunk bytes per write")
            }
            finishOp(success = true) { it is GattOp.RequestMtu }   // a refused MTU is not an error
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int
        ) {
            if (characteristic.uuid == CHARACTERISTIC_UUID) {
                finishOp(status == BluetoothGatt.GATT_SUCCESS) { it is GattOp.Write }
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int
        ) {
            if (descriptor.uuid == CLIENT_CHARACTERISTIC_CONFIG_UUID) {
                finishOp(status == BluetoothGatt.GATT_SUCCESS) { it is GattOp.EnableNotify }
                // Notifications are on, so replies can reach us now: ask the
                // board which firmware it runs (shown in Settings).
                if (status == BluetoothGatt.GATT_SUCCESS) sendData("ver")
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                @Suppress("DEPRECATION") handleIncomingData(characteristic.value)
            }
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                handleIncomingData(value)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic
        ) {
            @Suppress("DEPRECATION") handleIncomingData(characteristic.value)
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray
        ) {
            handleIncomingData(value)
        }
    }

    /**
     * Accumulates bytes and extracts complete lines when a delimiter (backslash) is found.
     */
    private fun handleIncomingData(data: ByteArray?) {
        if (data == null) return

        val hexString = data.joinToString("") { "%02x".format(it) }
        Log.d("BleManager", "Raw bytes (hex): $hexString")

        dataBuffer.write(data)

        val buffer = dataBuffer.toByteArray()
        var start = 0
        var foundDelimiter = false

        for (i in buffer.indices) {
            if (buffer[i] == delimiterByte) {
                // Extract line from start to i (excluding the delimiter)
                val lineBytes = buffer.copyOfRange(start, i)
                if (lineBytes.isNotEmpty()) {
                    val line = String(lineBytes, charset)
                    Log.d("BleManager", "Complete line: $line")
                    _receivedData.value = line
                    _isDataAvailable.value = true
                    _lines.tryEmit(line)
                    if (line.startsWith("VER,")) _firmwareVersion.value = line.substringAfter(',')
                    if (!quiet && !isProtocolLine(line)) {
                        handler.post {
                            Toast.makeText(context, "Received: $line", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                start = i + 1
                foundDelimiter = true
            }
        }

        if (foundDelimiter) {
            // Keep any bytes after the last delimiter
            if (start < buffer.size) {
                val remaining = buffer.copyOfRange(start, buffer.size)
                dataBuffer.reset()
                dataBuffer.write(remaining)
            } else {
                dataBuffer.reset()
            }
        } else if (buffer.size > MAX_PENDING_BYTES) {
            // Something that never sends the delimiter (e.g. older firmware): don't grow forever.
            dataBuffer.reset()
        }
        // If no delimiter found, everything remains in the buffer for next chunk
    }

    // Replies used by the app itself (version check, firmware update) - no toast.
    private fun isProtocolLine(line: String) =
        PROTOCOL_PREFIXES.any { line.startsWith(it) }

    @SuppressLint("MissingPermission")
    private fun startEnableNotifications(
        gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic
    ): Boolean {
        gatt.setCharacteristicNotification(characteristic, true)
        val descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
            ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeDescriptor(
                descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            ) == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION") descriptor.value =
                BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            @Suppress("DEPRECATION") gatt.writeDescriptor(descriptor)
        }
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        Log.d("BleManager", "Disconnecting")
        stopScanning()
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        _connectionState.value = BluetoothProfile.STATE_DISCONNECTED
        _firmwareVersion.value = null
        dataBuffer.reset()
        gattHandler.post { clearQueue() }
    }

    private companion object {
        const val DEFAULT_CHUNK = 20              // ATT_MTU 23 - 3
        const val MAX_CHUNK = 244                 // ATT_MTU 247 - 3
        const val REQUESTED_MTU = 247
        const val OP_TIMEOUT_MS = 3000L
        const val MAX_START_ATTEMPTS = 50         // x 20 ms
        const val MAX_PENDING_BYTES = 1024
        val PROTOCOL_PREFIXES = listOf("VER,", "OTA", "BOOT,", "OK,", "ERR,", "DONE")
    }
}

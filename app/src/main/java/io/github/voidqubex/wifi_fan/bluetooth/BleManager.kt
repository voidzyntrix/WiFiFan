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
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.UUID

@Suppress("PrivatePropertyName")
class BleManager(private val context: Context) {

    private val bluetoothManager: BluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val scanner get() = bluetoothAdapter?.bluetoothLeScanner
    private var bluetoothGatt: BluetoothGatt? = null

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
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }

    @SuppressLint("MissingPermission")
    fun sendData(data: String) {
        val gatt = bluetoothGatt ?: return
        val service = gatt.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(CHARACTERISTIC_UUID)
        val finalData = data + "\\"

        Log.d("BleManager", "Trying to send data: $finalData")

        if (characteristic != null) {
            val bytes = finalData.toByteArray()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeCharacteristic(
                    characteristic, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                )
            } else {
                @Suppress("DEPRECATION") characteristic.value = bytes
                @Suppress("DEPRECATION") gatt.writeCharacteristic(characteristic)
            }
        } else {
            Log.e("BleManager", "Characteristic not found")
        }
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
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i("BleManager", "Services discovered.")

                val uartService = gatt.getService(SERVICE_UUID)
                if (uartService != null) {
                    val notifyChar = uartService.getCharacteristic(NOTIFY_CHARACTERISTIC_UUID)
                    if (notifyChar != null) {
                        if (notifyChar.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) {
                            enableNotifications(gatt, notifyChar)
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
                    handler.post {
                        Toast.makeText(context, "Received: $line", Toast.LENGTH_SHORT).show()
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
        }
        // If no delimiter found, everything remains in the buffer for next chunk
    }

    @SuppressLint("MissingPermission")
    private fun enableNotifications(
        gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic
    ) {
        gatt.setCharacteristicNotification(characteristic, true)
        val descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
        if (descriptor != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION") descriptor.value =
                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION") gatt.writeDescriptor(descriptor)
            }
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
        dataBuffer.reset()
    }
}

package io.github.voidqubex.wifi_fan

import android.Manifest
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
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Bluetooth LE for the shared app: scanning (every device heard, by name), and one link at a time
 * to a device's serial characteristic: the first of the requested profiles (service, write, notify)
 * the device has. Device types speak their own protocol on top (web/src/devices).
 *
 * Writes are queued one at a time (GATT allows one operation in flight); each is answered with a
 * `bleWritten` event. Incoming bytes go out as `bleData`, link changes as `bleState`.
 */
@SuppressLint("MissingPermission")   // asked for before every scan and connect (MainActivity.withPermissions)
class Ble(private val activity: MainActivity, private val emit: (String, JSONObject) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    /** Runs [block] on the main thread (GATT callbacks arrive on a binder thread). */
    private fun ui(block: () -> Unit) { main.post(block) }
    private val adapter: BluetoothAdapter? = (activity.getSystemService(BluetoothManager::class.java))?.adapter
    private val heard = LinkedHashMap<String, String?>()
    private var scanning = false
    private var lastList = 0L

    private var gatt: BluetoothGatt? = null
    private var deviceId: String? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var serviceUuid: String? = null
    private var mtu = 23
    private var profiles: List<Triple<UUID, UUID, UUID?>> = emptyList()

    private class Write(val request: String, val data: ByteArray)
    private val queue = ArrayDeque<Write>()
    private var inFlight: Write? = null
    private val timeout = Runnable { finishWrite(false, "Bluetooth write timed out") }

    private val permissions = arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)

    private fun ready(then: () -> Unit, failed: (String) -> Unit) {
        activity.withPermissions(permissions, {
            val a = adapter
            if (a == null) failed("This phone has no Bluetooth")
            else if (!a.isEnabled) {
                activity.startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
                failed("Turn Bluetooth on and try again")
            } else then()
        }, { failed("Glow needs the Nearby devices permission for Bluetooth") })
    }

    // --- Scanning -------------------------------------------------------------------------------

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = heard(result.device, result.scanRecord?.deviceName)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { heard(it.device, it.scanRecord?.deviceName) }
    }

    private fun heard(device: BluetoothDevice, advertised: String?) {
        val name = advertised ?: device.name
        val known = heard.containsKey(device.address)
        if (known && (name == null || heard[device.address] == name)) return
        heard[device.address] = name
        val now = System.currentTimeMillis()
        if (now - lastList < 250) { main.removeCallbacks(sendList); main.postDelayed(sendList, 250); return }
        sendList.run()
    }

    private val sendList = Runnable {
        lastList = System.currentTimeMillis()
        val list = JSONArray()
        // named devices first; the unnamed ones are rarely what you are looking for
        heard.entries.sortedBy { it.value == null }.forEach {
            list.put(JSONObject().put("id", it.key).put("name", it.value ?: JSONObject.NULL))
        }
        emit("bleDevices", JSONObject().put("devices", list))
    }

    fun scan(on: Boolean) = ui {
        if (!on) { stopScan(); return@ui }
        ready({
            stopScan()
            heard.clear()
            sendList.run()
            val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
            adapter?.bluetoothLeScanner?.startScan(null, settings, scanCallback)
            scanning = true
        }, { msg -> emit("bleDevices", JSONObject().put("devices", JSONArray()).put("error", msg)) })
    }

    private fun stopScan() {
        if (!scanning) return
        scanning = false
        runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    }

    // --- Connecting -----------------------------------------------------------------------------

    fun connect(id: String, profilesJson: String) = ui {
        val arr = JSONArray(profilesJson)
        profiles = (0 until arr.length()).map {
            val p = arr.getJSONObject(it)
            Triple(UUID.fromString(p.getString("service")), UUID.fromString(p.getString("write")),
                if (p.isNull("notify")) null else UUID.fromString(p.getString("notify")))
        }
        ready({
            stopScan()
            disconnect(quiet = true)
            deviceId = id
            mtu = 23
            val device = adapter!!.getRemoteDevice(id)
            emit("bleState", JSONObject().put("id", id).put("state", "connecting"))
            gatt = device.connectGatt(activity, false, callback, BluetoothDevice.TRANSPORT_LE)
            main.postDelayed(connectTimeout, 15_000)
        }, { msg -> emit("bleState", JSONObject().put("id", id).put("state", "failed").put("error", msg)) })
    }

    private val connectTimeout = Runnable {
        if (writeChar == null && gatt != null) fail("The device didn't answer. Is it powered and in range?")
    }

    private fun fail(error: String) {
        val id = deviceId
        disconnect(quiet = true)
        emit("bleState", JSONObject().put("id", id).put("state", "failed").put("error", error))
    }

    fun disconnect(quiet: Boolean = false) {
        main.removeCallbacks(connectTimeout)
        val g = gatt
        val id = deviceId
        gatt = null
        writeChar = null
        clearQueue("Bluetooth link closed")
        if (g != null) { runCatching { g.disconnect() }; runCatching { g.close() } }
        if (!quiet && id != null) emit("bleState", JSONObject().put("id", id).put("state", "disconnected"))
        if (!quiet) deviceId = null
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) = ui {
            if (g != gatt) return@ui
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (writeChar == null) fail("Could not connect (status $status)")
                else disconnect()
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) = ui {
            if (g != gatt) return@ui
            for ((service, write, notify) in profiles) {
                val s = g.getService(service) ?: continue
                val w = s.getCharacteristic(write) ?: continue
                writeChar = w
                serviceUuid = service.toString()
                // most modules notify on their own characteristic; some answer on the write one
                val n = notify?.let { s.getCharacteristic(it) } ?: w.takeIf { it.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 }
                if (n != null) {
                    g.setCharacteristicNotification(n, true)
                    val cccd = n.getDescriptor(CCCD)
                    if (cccd != null) {
                        if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        else @Suppress("DEPRECATION") { cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE; g.writeDescriptor(cccd) }
                        return@ui   // the MTU request follows once the descriptor is written
                    }
                }
                g.requestMtu(247)
                return@ui
            }
            fail("This device doesn't speak any of Glow's device types")
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) = ui {
            if (g == gatt && d.uuid == CCCD) g.requestMtu(247)
        }

        override fun onMtuChanged(g: BluetoothGatt, value: Int, status: Int) = ui {
            if (g != gatt) return@ui
            if (status == BluetoothGatt.GATT_SUCCESS) mtu = value
            if (writeChar != null && inFlight == null) {
                main.removeCallbacks(connectTimeout)
                emit("bleState", JSONObject().put("id", deviceId).put("state", "connected").put("mtu", mtu)
                    .put("name", g.device.name ?: JSONObject.NULL).put("service", serviceUuid))
            }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) = ui {
            if (g == gatt) finishWrite(status == BluetoothGatt.GATT_SUCCESS, "Bluetooth write failed ($status)")
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) =
            received(value)

        @Deprecated("Android 12")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            if (Build.VERSION.SDK_INT < 33) received(c.value ?: return)
        }
    }

    private fun received(bytes: ByteArray) {
        emit("bleData", JSONObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)))
    }

    // --- Writing --------------------------------------------------------------------------------

    fun write(request: String, data: ByteArray) = ui {
        queue.addLast(Write(request, data))
        pump()
    }

    private fun pump() {
        if (inFlight != null) return
        val w = queue.removeFirstOrNull() ?: return
        val g = gatt
        val c = writeChar
        if (g == null || c == null) { answer(w, false, "Not connected"); pump(); return }
        inFlight = w
        val noResponse = c.properties and BluetoothGattCharacteristic.PROPERTY_WRITE == 0
        val type = if (noResponse) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        val started = if (Build.VERSION.SDK_INT >= 33) {
            g.writeCharacteristic(c, w.data, type) == BluetoothGatt.GATT_SUCCESS
        } else @Suppress("DEPRECATION") {
            c.writeType = type
            c.value = w.data
            g.writeCharacteristic(c)
        }
        if (!started) { finishWrite(false, "Bluetooth is busy"); return }
        main.postDelayed(timeout, 3000)
    }

    private fun finishWrite(ok: Boolean, error: String) {
        main.removeCallbacks(timeout)
        val w = inFlight ?: return
        inFlight = null
        answer(w, ok, error)
        pump()
    }

    private fun answer(w: Write, ok: Boolean, error: String) {
        val out = JSONObject().put("request", w.request).put("ok", ok)
        if (!ok) out.put("error", error)
        emit("bleWritten", out)
    }

    private fun clearQueue(error: String) {
        main.removeCallbacks(timeout)
        inFlight?.let { answer(it, false, error) }
        inFlight = null
        while (queue.isNotEmpty()) answer(queue.removeFirst(), false, error)
    }

    companion object {
        private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
}

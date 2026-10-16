package io.github.voidqubex.wifi_fan

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.PatternMatcher
import android.util.Base64
import org.json.JSONObject
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Wi-Fi boards for the shared app (web/src/platform/wifi.ts): the UDP discovery broadcast, TCP links,
 * and joining an unpaired board's own network to pair it.
 *
 * Discovery sends "GLOW?" to the Wi-Fi network's broadcast address on UDP 4211 about once a second;
 * each answer ("GLOW,<id>,<name>,<version>,<state>") goes out as a `wifiFound` event. Links answer
 * `tcp` (connected), `tcpWritten`, and send `tcpData` / `tcpClosed`.
 *
 * Pairing: [joinSetup] asks Android to join a network whose name starts with the prefix
 * (WifiNetworkSpecifier: the system lists the matching networks and the user picks the board). That
 * network is this app's only; links opened while it is joined go through it.
 */
class Wifi(private val activity: MainActivity, private val emit: (String, JSONObject) -> Unit) {
    private val cm = activity.getSystemService(ConnectivityManager::class.java)
    private val wm = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var askedScan = false
    private val sockets = ConcurrentHashMap<String, Socket>()
    private val nextId = AtomicInteger(1)
    private val writer = Executors.newSingleThreadExecutor()

    @Volatile private var discovering = false
    @Volatile private var setupNetwork: Network? = null
    private var setupCallback: ConnectivityManager.NetworkCallback? = null

    // --- Discovery --------------------------------------------------------------------------------

    /** The phone's own Wi-Fi network (not a board's setup network), if it is on one. */
    private fun homeWifi(): Network? = cm.allNetworks.firstOrNull { n ->
        n != setupNetwork && cm.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }

    private fun broadcastOf(lp: LinkProperties?): InetAddress? {
        val la = lp?.linkAddresses?.firstOrNull { it.address is Inet4Address } ?: return null
        val ip = la.address.address
        val prefix = la.prefixLength
        val mask = if (prefix == 0) 0 else -1 shl (32 - prefix)
        val n = ((ip[0].toInt() and 255) shl 24) or ((ip[1].toInt() and 255) shl 16) or ((ip[2].toInt() and 255) shl 8) or (ip[3].toInt() and 255)
        val b = n or mask.inv()
        return InetAddress.getByAddress(byteArrayOf((b ushr 24).toByte(), (b ushr 16).toByte(), (b ushr 8).toByte(), b.toByte()))
    }

    fun discover(on: Boolean) {
        if (!on) { discovering = false; return }
        if (discovering) return
        discovering = true
        thread(name = "glow-discover") {
            try {
                DatagramSocket().use { udp ->
                    udp.broadcast = true
                    udp.soTimeout = 250
                    val net = homeWifi()
                    net?.bindSocket(udp)
                    val targets = listOfNotNull(broadcastOf(net?.let { cm.getLinkProperties(it) }), InetAddress.getByName("255.255.255.255")).distinct()
                    val ping = "GLOW?".toByteArray()
                    val buf = ByteArray(256)
                    var lastPing = 0L
                    while (discovering) {
                        val now = System.currentTimeMillis()
                        if (now - lastPing > 1000) {
                            lastPing = now
                            for (t in targets) try { udp.send(DatagramPacket(ping, ping.size, t, UDP_PORT)) } catch (_: IOException) {}
                        }
                        val packet = DatagramPacket(buf, buf.size)
                        try { udp.receive(packet) } catch (_: SocketTimeoutException) { continue }
                        val parts = String(packet.data, 0, packet.length, Charsets.UTF_8).trim().split(',')
                        if (parts.size < 2 || parts[0] != "GLOW") continue
                        emit("wifiFound", JSONObject()
                            .put("id", parts[1])
                            .put("name", parts.getOrNull(2) ?: JSONObject.NULL)
                            .put("version", parts.getOrNull(3) ?: JSONObject.NULL)
                            .put("state", parts.getOrNull(4) ?: "ready")
                            .put("host", packet.address.hostAddress))
                    }
                }
            } catch (e: Exception) {
                discovering = false
            }
        }
    }

    // --- TCP links ----------------------------------------------------------------------------------

    fun connect(request: String, host: String, port: Int) {
        thread(name = "glow-tcp") {
            val out = JSONObject().put("request", request)
            val socket = Socket()
            try {
                // through the board's setup network while one is joined, else the phone's Wi-Fi
                (setupNetwork ?: homeWifi())?.bindSocket(socket)
                socket.tcpNoDelay = true
                socket.keepAlive = true
                socket.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
            } catch (e: Exception) {
                try { socket.close() } catch (_: IOException) {}
                emit("tcp", out.put("ok", false).put("error", if (e is SocketTimeoutException) "$host didn't answer" else (e.message ?: e.toString())))
                return@thread
            }
            val id = nextId.getAndIncrement().toString()
            sockets[id] = socket
            emit("tcp", out.put("ok", true).put("socket", id))
            val buf = ByteArray(1024)
            try {
                val input = socket.getInputStream()
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    emit("tcpData", JSONObject().put("socket", id).put("base64", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)))
                }
            } catch (_: IOException) {
            }
            close(id)
        }
    }

    fun write(request: String, id: String, data: ByteArray) {
        writer.execute {
            val out = JSONObject().put("request", request)
            val socket = sockets[id]
            try {
                if (socket == null) throw IOException("Not connected")
                socket.getOutputStream().apply { write(data); flush() }
                out.put("ok", true)
            } catch (e: IOException) {
                out.put("ok", false).put("error", e.message ?: "Write failed")
            }
            emit("tcpWritten", out)
        }
    }

    fun close(id: String) {
        val socket = sockets.remove(id) ?: return
        try { socket.close() } catch (_: IOException) {}
        emit("tcpClosed", JSONObject().put("socket", id))
    }

    // --- Which boards are waiting to be paired, and which network the phone is on -----------------

    private val scanPermissions =
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.NEARBY_WIFI_DEVICES)
        else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    /** Names of nearby networks starting with [prefix] (an unpaired board opens "Glow-XXXX"). */
    @Suppress("MissingPermission")
    fun scanSetup(request: String, prefix: String) {
        val reply = { ssids: List<String> ->
            emit("wifiScan", JSONObject().put("request", request).put("ok", true).put("ssids", org.json.JSONArray(ssids)))
        }
        val read = {
            try { wm.startScan() } catch (_: SecurityException) {}
            val found = try { wm.scanResults.map { it.SSID }.filter { it.startsWith(prefix) }.distinct() } catch (_: SecurityException) { emptyList() }
            reply(found)
        }
        if (scanPermissions.all { activity.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) read()
        else if (!askedScan) {   // asked once; after a refusal the list is simply empty
            askedScan = true
            activity.withPermissions(scanPermissions, { read() }, { reply(emptyList()) })
        } else reply(emptyList())
    }

    /** The network the phone is on. Android never gives an app its password; the name needs location. */
    @Suppress("DEPRECATION", "MissingPermission")
    fun currentNetwork(request: String) {
        val read = {
            val ssid = try { wm.connectionInfo?.ssid?.trim('"') } catch (_: SecurityException) { null }
            val out = JSONObject().put("request", request).put("ok", true)
            if (ssid.isNullOrEmpty() || ssid == WifiManager.UNKNOWN_SSID) out.put("ssid", JSONObject.NULL) else out.put("ssid", ssid)
            emit("wifiCurrent", out.put("password", JSONObject.NULL))
        }
        activity.withPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), read, {
            emit("wifiCurrent", JSONObject().put("request", request).put("ok", true).put("ssid", JSONObject.NULL).put("password", JSONObject.NULL))
        })
    }

    // --- Pairing: the board's own network -------------------------------------------------------------

    fun joinSetup(request: String, prefix: String, password: String) {
        val permissions =
            if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.NEARBY_WIFI_DEVICES)
            else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        activity.withPermissions(permissions, { requestSetup(request, prefix, password) }, {
            emit("wifiSetup", JSONObject().put("request", request).put("ok", false)
                .put("error", "Glow needs the Nearby devices permission to join the board's network"))
        })
    }

    private fun requestSetup(request: String, prefix: String, password: String) {
        leaveSetup()
        val spec = WifiNetworkSpecifier.Builder()
            .setSsidPattern(PatternMatcher(prefix, PatternMatcher.PATTERN_PREFIX))
            .setWpa2Passphrase(password)
            .build()
        val req = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(spec)
            .build()
        var answered = false
        val answer = { ok: Boolean, error: String? ->
            if (!answered) {
                answered = true
                val out = JSONObject().put("request", request).put("ok", ok)
                if (ok) out.put("ssid", JSONObject.NULL) else out.put("error", error)
                emit("wifiSetup", out)
            }
        }
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                setupNetwork = network
                answer(true, null)
            }
            override fun onUnavailable() {
                setupCallback = null
                answer(false, "No board network was joined")
            }
            override fun onLost(network: Network) {
                if (setupNetwork == network) setupNetwork = null
            }
        }
        setupCallback = callback
        cm.requestNetwork(req, callback, SETUP_TIMEOUT_MS)
    }

    fun leaveSetup() {
        setupCallback?.let { try { cm.unregisterNetworkCallback(it) } catch (_: IllegalArgumentException) {} }
        setupCallback = null
        setupNetwork = null
    }

    fun shutdown() {
        discovering = false
        leaveSetup()
        sockets.keys.toList().forEach(::close)
        writer.shutdown()
    }

    companion object {
        private const val UDP_PORT = 4211
        private const val CONNECT_TIMEOUT_MS = 6000
        private const val SETUP_TIMEOUT_MS = 120_000
    }
}

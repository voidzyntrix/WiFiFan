package io.github.voidqubex.wifi_fan.solar

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** One reading of the inverter. Powers are in kW. */
data class SolarReading(
    /** Positive: importing from the grid. Negative: exporting to it. */
    val gridKw: Float,
    /** The home battery's charge, null when the inverter has no battery. */
    val socPercent: Float?,
    val pvKw: Float,
    val loadKw: Float,
    val fault: Boolean,
    /** The grid is down and the inverter runs the house from its battery (runningState 164, "off-grid"). */
    val offGrid: Boolean = false
)

data class FoxDevice(val serial: String, val name: String, val status: Int)

/**
 * The FoxESS Cloud Open API (www.foxesscloud.com): a personal API key from the user's account.
 * Every request is a POST with the headers `token` (the key), `timestamp` (ms), `lang` and
 * `signature` = MD5 of `path \r\n token \r\n timestamp`. Each inverter may be asked 1,440 times a
 * day, so the service polls every few minutes.
 */
object FoxEssClient {
    private const val HOST = "https://www.foxesscloud.com"
    private const val DEVICE_LIST = "/op/v0/device/list"
    private const val REAL_QUERY = "/op/v1/device/real/query"
    private val VARIABLES = listOf(
        "pvPower", "gridConsumptionPower", "feedinPower", "loadsPower", "SoC", "runningState", "currentFaultCount"
    )

    fun md5Hex(text: String): String =
        MessageDigest.getInstance("MD5").digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    fun signature(path: String, token: String, timestamp: Long): String =
        md5Hex(path + "\r\n" + token + "\r\n" + timestamp)

    /** The inverters on the account. Blocking: call it off the main thread. */
    fun devices(token: String): List<FoxDevice> =
        parseDevices(post(DEVICE_LIST, token, JSONObject().put("currentPage", 1).put("pageSize", 10)))

    /** The inverter's latest values. Blocking: call it off the main thread. */
    fun reading(token: String, serial: String): SolarReading = parseReading(
        post(
            REAL_QUERY, token,
            JSONObject().put("sns", JSONArray().put(serial)).put("variables", JSONArray(VARIABLES))
        )
    )

    internal fun parseDevices(json: String): List<FoxDevice> {
        val data = checked(json).optJSONObject("result")?.optJSONArray("data") ?: return emptyList()
        return (0 until data.length()).map { i ->
            val o = data.getJSONObject(i)
            FoxDevice(o.getString("deviceSN"), o.optString("stationName"), o.optInt("status", 0))
        }
    }

    internal fun parseReading(json: String): SolarReading {
        val datas = checked(json).optJSONArray("result")?.optJSONObject(0)?.optJSONArray("datas")
            ?: throw IOException("FoxESS returned no data for this inverter")
        val values = HashMap<String, Double>()
        for (i in 0 until datas.length()) {
            val o = datas.getJSONObject(i)
            val v = o.optDouble("value")
            if (!v.isNaN()) values[o.getString("variable")] = v
        }
        val grid = (values["gridConsumptionPower"] ?: 0.0) - (values["feedinPower"] ?: 0.0)
        val state = values["runningState"]?.toInt()
        val fault = (values["currentFaultCount"] ?: 0.0) > 0.0 || state == 165 || state == 166
        return SolarReading(
            gridKw = grid.toFloat(),
            socPercent = values["SoC"]?.toFloat(),
            pvKw = (values["pvPower"] ?: 0.0).toFloat(),
            loadKw = (values["loadsPower"] ?: 0.0).toFloat(),
            fault = fault,
            offGrid = state == 164
        )
    }

    /** The parsed answer, or an IOException saying what FoxESS complained about. */
    private fun checked(json: String): JSONObject {
        val root = JSONObject(json)
        val errno = root.optInt("errno", -1)
        if (errno != 0) {
            val hint = when (errno) {
                40256 -> "the API key isn't accepted: check it"
                40400 -> "too many requests: try again in a minute"
                else -> root.optString("msg", "error")
            }
            throw IOException("FoxESS: $hint ($errno)")
        }
        return root
    }

    private fun post(path: String, token: String, body: JSONObject): String {
        val conn = URL(HOST + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.doOutput = true
            val timestamp = System.currentTimeMillis()
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("token", token)
            conn.setRequestProperty("timestamp", timestamp.toString())
            conn.setRequestProperty("signature", signature(path, token, timestamp))
            conn.setRequestProperty("lang", "en")
            conn.setRequestProperty("User-Agent", "Glow-app")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("FoxESS answered HTTP $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}

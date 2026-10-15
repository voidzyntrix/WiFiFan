package io.github.voidqubex.wifi_fan

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Base64
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * What the shared app (web/src/platform/android.ts) calls as `window.GlowAndroid`. Calls arrive on a
 * WebView thread; answers and events go back through [emit] as `window.__glowEmit(name, json)`.
 */
class Bridge(private val activity: MainActivity, private val web: WebView) {
    private val ble = Ble(activity, ::emit)

    fun emit(name: String, data: JSONObject) {
        val js = "window.__glowEmit && window.__glowEmit(${JSONObject.quote(name)}, ${JSONObject.quote(data.toString())})"
        web.post { web.evaluateJavascript(js, null) }
    }

    fun close() = ble.disconnect()

    @JavascriptInterface
    fun info(): String {
        val accent = if (Build.VERSION.SDK_INT >= 31) {
            // the wallpaper's Material You colour (the seed the system palette grows from)
            String.format("#%06X", activity.getColor(android.R.color.system_accent1_500) and 0xFFFFFF)
        } else null
        return JSONObject()
            .put("version", activity.packageManager.getPackageInfo(activity.packageName, 0).versionName)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("accent", accent ?: JSONObject.NULL)
            .toString()
    }

    // --- Bluetooth LE -------------------------------------------------------------------------

    @JavascriptInterface fun bleScan(on: Boolean) = ble.scan(on)
    @JavascriptInterface fun bleConnect(id: String, profiles: String) = ble.connect(id, profiles)
    @JavascriptInterface fun bleWrite(request: String, base64: String) = ble.write(request, Base64.decode(base64, Base64.NO_WRAP))
    @JavascriptInterface fun bleDisconnect() = ble.disconnect()

    // --- Network (GitHub releases; the WebView would hit CORS) ----------------------------------

    @JavascriptInterface
    fun net(request: String, kind: String, url: String, limit: Int) {
        thread(name = "glow-net") {
            val out = JSONObject().put("request", request)
            try {
                val conn = open(url, if (kind == "exists") "HEAD" else "GET")
                when (kind) {
                    "exists" -> out.put("ok", true).put("exists", conn.responseCode in 200..299)
                    else -> {
                        if (conn.responseCode !in 200..299) throw Exception("GitHub answered HTTP ${conn.responseCode}")
                        val bytes = conn.inputStream.use { input ->
                            val buf = ByteArrayOutputStream()
                            val chunk = ByteArray(16 * 1024)
                            while (true) {
                                val n = input.read(chunk)
                                if (n < 0) break
                                buf.write(chunk, 0, n)
                                if (limit > 0 && buf.size() > limit) throw Exception("Download larger than expected")
                            }
                            buf.toByteArray()
                        }
                        out.put("ok", true)
                        if (kind == "text") out.put("text", String(bytes, Charsets.UTF_8))
                        else out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                out.put("ok", false).put("error", e.message ?: e.toString())
            }
            emit("net", out)
        }
    }

    // --- Everything else ------------------------------------------------------------------------

    @JavascriptInterface
    fun openExternal(url: String) {
        if (!url.startsWith("https://")) return
        activity.runOnUiThread { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }

    @JavascriptInterface
    fun haptic(kind: String) {
        val effect = when (kind) {
            "tick" -> HapticFeedbackConstants.CLOCK_TICK
            "confirm" -> HapticFeedbackConstants.CONFIRM
            "long" -> HapticFeedbackConstants.LONG_PRESS
            else -> HapticFeedbackConstants.CONTEXT_CLICK
        }
        web.post { web.performHapticFeedback(effect) }
    }

    @JavascriptInterface fun keepAwake(on: Boolean) = activity.keepAwake(on)
    @JavascriptInterface fun darkTheme(dark: Boolean) = activity.setDarkTheme(dark)

    @JavascriptInterface
    fun updateInstall(url: String, version: String) = Updater.start(activity, url, version) { state -> emit("update", state) }

    companion object {
        fun open(url: String, method: String = "GET"): HttpURLConnection =
            (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                instanceFollowRedirects = true
                connectTimeout = 15_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "Glow-android")
                setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream")
            }
    }
}

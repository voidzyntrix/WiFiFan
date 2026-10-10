package io.github.voidqubex.wifi_fan.ota

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A firmware build attached to a GitHub release. */
data class FirmwareRelease(
    val version: String,        // e.g. "1.0.1"
    val tag: String,            // release tag, e.g. "fw-v1.0.1"
    val downloadUrl: String,
    val size: Int
)

/**
 * Finds board firmware in this repo's GitHub Releases.
 *
 * Convention: a release has an asset named `wififan-fw-<major>.<minor>.<patch>.bin`
 * (made by the firmware project's tools/make_fw_release.sh). The newest version
 * across all releases wins; drafts and pre-releases are ignored.
 */
object FirmwareRepository {
    private const val RELEASES_URL =
        "https://api.github.com/repos/voidzyntrix/WiFiFan/releases?per_page=30"
    private val ASSET_NAME = Regex("""wififan-fw-(\d+\.\d+\.\d+)\.bin""")

    /** Must match the board's bootloader: app slot size and link address. */
    const val APP_MAX = 56 * 1024
    private const val APP_BASE = 0x2000

    suspend fun latest(): FirmwareRelease? = withContext(Dispatchers.IO) {
        val json = String(get(RELEASES_URL, limit = 2 * 1024 * 1024), Charsets.UTF_8)
        val releases = JSONArray(json)
        var best: FirmwareRelease? = null
        for (i in 0 until releases.length()) {
            val rel = releases.getJSONObject(i)
            if (rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue
            val assets = rel.optJSONArray("assets") ?: continue
            for (j in 0 until assets.length()) {
                val asset = assets.getJSONObject(j)
                val version = ASSET_NAME.matchEntire(asset.optString("name"))?.groupValues?.get(1)
                    ?: continue
                val candidate = FirmwareRelease(
                    version     = version,
                    tag         = rel.optString("tag_name"),
                    downloadUrl = asset.getString("browser_download_url"),
                    size        = asset.optInt("size")
                )
                if (best == null || compareVersions(candidate.version, best.version) > 0) {
                    best = candidate
                }
            }
        }
        best
    }

    /** Downloads the image and checks it fits the board; throws with a readable message if not. */
    suspend fun download(release: FirmwareRelease): ByteArray = withContext(Dispatchers.IO) {
        val image = get(release.downloadUrl, limit = APP_MAX + 1)
        validate(image)?.let { throw IOException(it) }
        image
    }

    /** null if the image can be flashed, otherwise why not. */
    fun validate(image: ByteArray): String? {
        if (image.size < 8) return "Firmware file is empty"
        if (image.size > APP_MAX) return "Firmware is ${image.size} bytes, the board holds $APP_MAX"
        // Word 1 is the vector table's _start entry = the address the image was linked for.
        val base = ByteBuffer.wrap(image, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
        if (base != APP_BASE) {
            return "Firmware is built for address 0x%x, not 0x%x (bootloader layout)".format(base, APP_BASE)
        }
        return null
    }

    /** Compares "1.2.3"-style versions numerically; missing parts count as 0. */
    fun compareVersions(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val d = pa.getOrElse(i) { 0 } - pb.getOrElse(i) { 0 }
            if (d != 0) return d
        }
        return 0
    }

    private fun get(url: String, limit: Int): ByteArray {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.instanceFollowRedirects = true              // assets redirect to a CDN
            conn.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream")
            conn.setRequestProperty("User-Agent", "WiFiFan-app")
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("GitHub answered HTTP $code")
            conn.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(8192)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > limit) throw IOException("Download larger than expected")
                }
                return out.toByteArray()
            }
        } finally {
            conn.disconnect()
        }
    }
}

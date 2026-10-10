package io.github.voidqubex.wifi_fan.ota

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** A versioned file attached to a GitHub release (board firmware or the app's APK). */
data class ReleaseAsset(
    val version: String,        // e.g. "1.0.1"
    val tag: String,            // release tag, e.g. "fw-v1.0.1"
    val downloadUrl: String,
    val size: Long
)

/**
 * Reads this repo's GitHub Releases. Firmware and app releases live side by side;
 * each kind is told apart by its asset name. Drafts and pre-releases are ignored.
 */
object GitHubReleases {
    private const val RELEASES_URL =
        "https://api.github.com/repos/voidzyntrix/WiFiFan/releases?per_page=30"

    /**
     * The newest asset whose name fully matches [assetName], whose first group must
     * capture a "1.2.3"-style version. null if no release has one.
     */
    suspend fun newest(assetName: Regex): ReleaseAsset? = withContext(Dispatchers.IO) {
        val json = String(get(RELEASES_URL, limit = 2 * 1024 * 1024), Charsets.UTF_8)
        val releases = JSONArray(json)
        var best: ReleaseAsset? = null
        for (i in 0 until releases.length()) {
            val rel = releases.getJSONObject(i)
            if (rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue
            val assets = rel.optJSONArray("assets") ?: continue
            for (j in 0 until assets.length()) {
                val asset = assets.getJSONObject(j)
                val version = assetName.matchEntire(asset.optString("name"))?.groupValues?.get(1)
                    ?: continue
                val candidate = ReleaseAsset(
                    version     = version,
                    tag         = rel.optString("tag_name"),
                    downloadUrl = asset.getString("browser_download_url"),
                    size        = asset.optLong("size")
                )
                if (best == null || compareVersions(candidate.version, best.version) > 0) {
                    best = candidate
                }
            }
        }
        best
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

    /** Downloads [url] into memory; throws if it is larger than [limit] bytes. */
    fun get(url: String, limit: Int): ByteArray = open(url) { input, _ ->
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8192)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            if (out.size() > limit) throw IOException("Download larger than expected")
        }
        out.toByteArray()
    }

    /**
     * Streams [url] into [dest], reporting (bytes so far, total or -1) to [progress].
     * Throws if it is larger than [limit] bytes.
     */
    fun download(url: String, dest: File, limit: Long, progress: (Long, Long) -> Unit) {
        open(url) { input, length ->
            dest.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                var read = 0L
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    read += n
                    if (read > limit) throw IOException("Download larger than expected")
                    progress(read, length)
                }
            }
        }
    }

    private fun <T> open(url: String, body: (InputStream, Long) -> T): T {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.instanceFollowRedirects = true              // assets redirect to a CDN
            conn.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream")
            conn.setRequestProperty("User-Agent", "WiFiFan-app")
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("GitHub answered HTTP $code")
            return conn.inputStream.use { body(it, conn.contentLengthLong) }
        } finally {
            conn.disconnect()
        }
    }
}

package io.github.voidqubex.wifi_fan.ota

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
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
    private const val TAG_URL = "https://api.github.com/repos/voidzyntrix/WiFiFan/releases/tags"
    private const val FEED_URL = "https://github.com/voidzyntrix/WiFiFan/releases.atom"
    private const val DOWNLOAD_URL = "https://github.com/voidzyntrix/WiFiFan/releases/download"
    private val TAG_IN_FEED = Regex("""/releases/tag/([A-Za-z]+)-v(\d+\.\d+\.\d+)""")
    private val ASSET_PREFIX = mapOf("fw" to "wififan-fw-%s.bin", "app" to "wififan-app-%s.apk")

    /**
     * The newest asset whose name fully matches [assetName], whose first group must
     * capture a "1.2.3"-style version. null if no release has one.
     */
    /** The newest matching asset from the release feed only (not rate limited; size unknown). */
    suspend fun newestFromFeedOnly(assetName: Regex): ReleaseAsset? = withContext(Dispatchers.IO) {
        newestFromFeed(assetName)
    }

    suspend fun newest(assetName: Regex): ReleaseAsset? = withContext(Dispatchers.IO) {
        // The API allows only 60 requests per hour per internet connection; when it
        // refuses (HTTP 403/429) or fails, fall back to the release feed, which isn't limited.
        try {
            newestFromApi(assetName)
        } catch (e: IOException) {
            newestFromFeed(assetName) ?: throw e
        }
    }

    /**
     * Release feed fallback: tags like "fw-v1.2.2" / "app-v1.3.2" name the version,
     * and assets have fixed names, so the download link can be built directly.
     * Size is unknown (0) here.
     */
    private fun newestFromFeed(assetName: Regex): ReleaseAsset? {
        val feed = String(get(FEED_URL, limit = 2 * 1024 * 1024), Charsets.UTF_8)
        val candidates = mutableListOf<ReleaseAsset>()
        for (m in TAG_IN_FEED.findAll(feed)) {
            val kind = m.groupValues[1]
            val version = m.groupValues[2]
            val name = ASSET_PREFIX[kind]?.format(version) ?: continue
            if (assetName.matchEntire(name)?.groupValues?.get(1) != version) continue
            val tag = "$kind-v$version"
            candidates += ReleaseAsset(version, tag, "$DOWNLOAD_URL/$tag/$name", 0L)
        }
        // The feed lists a tag as soon as it is pushed, minutes before its build has attached
        // the file (which then answers 404): only offer a version whose file is really there.
        return candidates
            .distinctBy { it.version }
            .sortedWith { x, y -> compareVersions(y.version, x.version) }
            .take(3)
            .firstOrNull { assetExists(it.downloadUrl) }
    }

    /** True when [url] can be downloaded (a HEAD request, following the redirect to the CDN). */
    private fun assetExists(url: String): Boolean = try {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "HEAD"
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Glow-app")
            conn.responseCode == HttpURLConnection.HTTP_OK
        } finally {
            conn.disconnect()
        }
    } catch (e: IOException) {
        false
    }

    private fun newestFromApi(assetName: Regex): ReleaseAsset? {
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
        return best
    }

    /**
     * Release notes (markdown) of the release tagged [tag], e.g. "app-v1.9.0"; null if
     * there is no such release. Falls back to the release feed (HTML turned into text).
     */
    suspend fun releaseNotes(tag: String): String? = withContext(Dispatchers.IO) {
        try {
            val json = String(get("$TAG_URL/$tag", limit = 1024 * 1024), Charsets.UTF_8)
            JSONObject(json).optString("body").takeIf { it.isNotBlank() }
        } catch (e: IOException) {
            notesFromFeed(tag) ?: throw e
        }
    }

    private fun notesFromFeed(tag: String): String? {
        val feed = String(get(FEED_URL, limit = 2 * 1024 * 1024), Charsets.UTF_8)
        val entry = feed.split("<entry>").firstOrNull { it.contains("/releases/tag/$tag\"") } ?: return null
        val html = Regex("<content[^>]*>(.*?)</content>", RegexOption.DOT_MATCHES_ALL)
            .find(entry)?.groupValues?.get(1) ?: return null
        return htmlToMarkdown(unescape(html)).takeIf { it.isNotBlank() }
    }

    private fun unescape(s: String) = s.replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")

    /** Just enough HTML -> markdown for release notes: headings, list items, paragraphs. */
    internal fun htmlToMarkdown(html: String): String = unescape(
        html.replace(Regex("<h[1-6][^>]*>"), "\n## ")
            .replace(Regex("<li[^>]*>"), "\n- ")
            .replace(Regex("<br\\s*/?>|</p>|</h[1-6]>|</ul>|</ol>"), "\n")
            .replace(Regex("<[^>]+>"), "")
    ).lines().joinToString("\n") { it.trim() }.replace(Regex("\n{3,}"), "\n\n").trim()

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
            conn.setRequestProperty("User-Agent", "Glow-app")
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("GitHub answered HTTP $code")
            return conn.inputStream.use { body(it, conn.contentLengthLong) }
        } finally {
            conn.disconnect()
        }
    }
}

package io.github.voidqubex.wifi_fan

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import kotlin.concurrent.thread

/**
 * One-click app updates for Glow for Android: downloads wififan-app-<version>.apk from a GitHub
 * release (the shared app found it and passes its URL), checks it is a newer Glow signed with the
 * same key, and hands it to Android's PackageInstaller, which asks "Update this app?" (from the
 * second self-update on, Android 12+ may not ask). Progress goes back to the app as `update` events.
 */
object Updater {
    private const val APK = "app-update.apk"
    private const val MAX = 150L * 1024 * 1024
    private var activity = WeakReference<MainActivity>(null)
    private var report: (JSONObject) -> Unit = {}
    private var waitingForPermission = false

    fun start(a: MainActivity, url: String, version: String, onState: (JSONObject) -> Unit) {
        activity = WeakReference(a)
        report = onState
        if (!url.startsWith("https://github.com/voidzyntrix/WiFiFan/releases/download/")) {
            error("Refusing to download from an unexpected address."); return
        }
        thread(name = "glow-update") {
            try {
                val apk = File(a.cacheDir, APK)
                val conn = Bridge.open(url)
                if (conn.responseCode !in 200..299) throw Exception("GitHub answered HTTP ${conn.responseCode}")
                val total = conn.contentLengthLong
                var received = 0L
                var lastSent = 0L
                conn.inputStream.use { input ->
                    apk.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            received += n
                            if (received > MAX) throw Exception("The download is larger than expected")
                            val now = System.currentTimeMillis()
                            if (now - lastSent > 150) {
                                lastSent = now
                                report(JSONObject().put("state", "downloading").put("received", received).put("total", total))
                            }
                        }
                    }
                }
                conn.disconnect()
                check(a, apk, version)?.let { throw Exception(it) }
                install(a)
            } catch (e: Exception) {
                error(e.message ?: e.toString())
            }
        }
    }

    private fun error(message: String) = report(JSONObject().put("state", "error").put("message", message))

    /** null if [apk] can update this app, otherwise why not. */
    private fun check(context: Context, apk: File, version: String): String? {
        val pm = context.packageManager
        @Suppress("DEPRECATION")
        val new = pm.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNING_CERTIFICATES) ?: return "The download isn't a valid APK"
        if (new.packageName != context.packageName) return "The download is a different app (${new.packageName})"
        @Suppress("DEPRECATION")
        val installed = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        if (new.longVersionCode <= installed.longVersionCode) return "The download (v$version) isn't newer than this app"
        val newSigners = new.signingInfo?.apkContentsSigners?.toSet()
        val oldSigners = installed.signingInfo?.apkContentsSigners?.toSet()
        if (newSigners != null && oldSigners != null && newSigners != oldSigners) {
            return "The update is signed with a different key than this app. Uninstall Glow and install the new APK by hand once."
        }
        return null
    }

    private fun install(a: MainActivity) {
        if (!a.packageManager.canRequestPackageInstalls()) {
            // Android has to allow Glow to install apps first; carry on when the user comes back.
            waitingForPermission = true
            a.runOnUiThread {
                a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}")))
            }
            return
        }
        report(JSONObject().put("state", "installing"))
        val apk = File(a.cacheDir, APK)
        val installer = a.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(a.packageName)
            setSize(apk.length())
            setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        try {
            installer.openSession(id).use { session ->
                apk.inputStream().use { input ->
                    session.openWrite("base.apk", 0, apk.length()).use { out -> input.copyTo(out); session.fsync(out) }
                }
                val callback = PendingIntent.getBroadcast(
                    a, id, Intent(a, InstallResultReceiver::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                session.commit(callback.intentSender)
            }
        } catch (e: Exception) {
            installer.abandonSession(id)
            throw e
        }
    }

    /** Back from the "install unknown apps" setting. */
    fun onResume(a: MainActivity) {
        if (!waitingForPermission) return
        waitingForPermission = false
        if (!a.packageManager.canRequestPackageInstalls()) { error("Glow wasn't allowed to install updates."); return }
        thread { try { install(a) } catch (e: Exception) { error(e.message ?: e.toString()) } }
    }

    internal fun onResult(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                val a = activity.get()
                if (confirm != null && a != null) a.runOnUiThread { a.startActivity(confirm) }
                else if (confirm != null) context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> {}
            PackageInstaller.STATUS_FAILURE_ABORTED -> error("The update was cancelled.")
            else -> error("Android couldn't install the update: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "status $status"}")
        }
    }
}

/** PackageInstaller results, and cleaning up the downloaded APK once the update landed. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) File(context.cacheDir, "app-update.apk").delete()
        else Updater.onResult(context, intent)
    }
}

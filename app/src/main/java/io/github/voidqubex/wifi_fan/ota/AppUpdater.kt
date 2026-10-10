package io.github.voidqubex.wifi_fan.ota

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import androidx.core.content.IntentCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

sealed interface AppUpdateState {
    object Idle : AppUpdateState
    object Checking : AppUpdateState
    data class UpToDate(val latest: String) : AppUpdateState
    data class UpdateAvailable(val release: ReleaseAsset) : AppUpdateState
    data class Downloading(val read: Long, val total: Long) : AppUpdateState
    /** The APK is downloaded, but the user hasn't allowed this app to install apps yet. */
    object NeedsPermission : AppUpdateState
    object Installing : AppUpdateState
    /** Android wants the user to confirm; the UI starts [confirm] while it is visible. */
    data class WaitingForUser(val confirm: Intent) : AppUpdateState
    data class Error(val message: String) : AppUpdateState

    val busy: Boolean get() = this is Downloading || this is Installing || this is WaitingForUser
}

/**
 * Updates the app itself from an APK in this repo's GitHub Releases.
 *
 * Convention: a release has an asset named `wififan-app-<major>.<minor>.<patch>.apk`
 * (made by .github/workflows/app-release.yml or tools/make_app_release.sh), signed
 * with the same key as the installed app. The newest version across all releases wins.
 *
 * The APK is handed to [PackageInstaller]; Android shows its "Update this app?" prompt
 * (from the second self-update on, Android 12+ may skip it). Android closes the app
 * when the update lands; the user then opens the new version.
 *
 * A process-wide object (not tied to the activity) so a download survives rotation
 * and [InstallResultReceiver] can report back to it.
 */
object AppUpdater {
    private val ASSET_NAME = Regex("""wififan-app-(\d+\.\d+\.\d+)\.apk""")
    private const val APK_MAX = 100L * 1024 * 1024
    private const val APK_FILE = "app-update.apk"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val _state = MutableStateFlow<AppUpdateState>(AppUpdateState.Idle)
    val state: StateFlow<AppUpdateState> = _state

    /** Kept so a cancelled install prompt can go back to "Update to vX". */
    private var pending: ReleaseAsset? = null

    fun installedVersion(context: Context): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"

    fun checkForUpdate(context: Context) {
        if (_state.value.busy || _state.value == AppUpdateState.Checking) return
        val current = installedVersion(context)
        scope.launch {
            _state.value = AppUpdateState.Checking
            _state.value = try {
                val latest = GitHubReleases.newest(ASSET_NAME)
                when {
                    latest == null -> AppUpdateState.Error("No app release found on GitHub")
                    GitHubReleases.compareVersions(latest.version, current) <= 0 ->
                        AppUpdateState.UpToDate(latest.version)
                    else -> AppUpdateState.UpdateAvailable(latest)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                AppUpdateState.Error("Couldn't check for updates: ${e.message}")
            }
        }
    }

    fun startUpdate(context: Context, release: ReleaseAsset) {
        if (_state.value.busy) return
        val app = context.applicationContext
        pending = release
        scope.launch {
            try {
                _state.value = AppUpdateState.Downloading(0, release.size)
                val apk = apkFile(app)
                withContext(Dispatchers.IO) {
                    var shownPercent = -1L
                    GitHubReleases.download(release.downloadUrl, apk, APK_MAX) { read, length ->
                        val total = if (length > 0) length else release.size
                        val percent = if (total > 0) read * 100 / total else -1
                        if (percent != shownPercent) {
                            shownPercent = percent
                            _state.value = AppUpdateState.Downloading(read, total)
                        }
                    }
                }
                checkApk(app, apk)?.let { throw IOException(it) }
                install(app)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = AppUpdateState.Error("Update failed: ${e.message}")
            }
        }
    }

    /** Call after the user returns from the "install unknown apps" setting. */
    fun continueInstall(context: Context) {
        if (_state.value != AppUpdateState.NeedsPermission) return
        val app = context.applicationContext
        if (!app.packageManager.canRequestPackageInstalls()) return
        scope.launch {
            try {
                install(app)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = AppUpdateState.Error("Update failed: ${e.message}")
            }
        }
    }

    /** Call once the UI has shown Android's confirmation prompt. */
    fun confirmShown() {
        if (_state.value is AppUpdateState.WaitingForUser) _state.value = AppUpdateState.Installing
    }

    private fun apkFile(context: Context) = File(context.cacheDir, APK_FILE)

    /** null if [apk] can update this app, otherwise why not. */
    private fun checkApk(context: Context, apk: File): String? {
        val pm = context.packageManager
        val new = archiveInfo(pm, apk) ?: return "The download isn't a valid APK"
        if (new.packageName != context.packageName) {
            return "The download is a different app (${new.packageName})"
        }
        @Suppress("DEPRECATION")
        val installed = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        if (new.longVersionCode <= installed.longVersionCode) {
            return "The download (version code ${new.longVersionCode}) isn't newer than " +
                "this app (${installed.longVersionCode})"
        }
        val newSigners = new.signingInfo?.apkContentsSigners?.toSet()
        val oldSigners = installed.signingInfo?.apkContentsSigners?.toSet()
        if (newSigners != null && oldSigners != null && newSigners != oldSigners) {
            return "The update is signed with a different key than this app. " +
                "Uninstall the app and install the new APK by hand once."
        }
        return null
    }

    @Suppress("DEPRECATION")
    private fun archiveInfo(pm: PackageManager, apk: File): PackageInfo? =
        pm.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNING_CERTIFICATES)

    private suspend fun install(context: Context) {
        if (!context.packageManager.canRequestPackageInstalls()) {
            _state.value = AppUpdateState.NeedsPermission
            return
        }
        _state.value = AppUpdateState.Installing
        withContext(Dispatchers.IO) {
            val apk = apkFile(context)
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(context.packageName)
                setSize(apk.length())
                // Honoured once this app installed the current version itself.
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val sessionId = installer.createSession(params)
            try {
                installer.openSession(sessionId).use { session ->
                    apk.inputStream().use { input ->
                        session.openWrite("base.apk", 0, apk.length()).use { out ->
                            input.copyTo(out)
                            session.fsync(out)
                        }
                    }
                    val callback = PendingIntent.getBroadcast(
                        context, sessionId,
                        Intent(context, InstallResultReceiver::class.java),
                        // Mutable: the installer adds the status extras.
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                    )
                    session.commit(callback.intentSender)
                }
            } catch (e: Exception) {
                installer.abandonSession(sessionId)
                throw e
            }
        }
    }

    internal fun onInstallResult(intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        _state.value = when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION ->
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                    ?.let { AppUpdateState.WaitingForUser(it) }
                    ?: AppUpdateState.Error("Android didn't ask to confirm the update")
            // Usually not seen: Android closes the app as the update lands.
            PackageInstaller.STATUS_SUCCESS -> AppUpdateState.Idle
            PackageInstaller.STATUS_FAILURE_ABORTED ->
                pending?.let { AppUpdateState.UpdateAvailable(it) } ?: AppUpdateState.Idle
            else -> AppUpdateState.Error("Android couldn't install the update: ${message ?: "status $status"}")
        }
    }

    internal fun onPackageReplaced(context: Context) {
        apkFile(context).delete()
    }
}

/** Receives PackageInstaller results, and deletes the downloaded APK once the update landed. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) AppUpdater.onPackageReplaced(context)
        else AppUpdater.onInstallResult(intent)
    }
}

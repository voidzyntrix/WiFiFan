package io.github.voidqubex.wifi_fan

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import androidx.webkit.WebViewAssetLoader

/**
 * Glow for Android: a window that shows the shared Glow app (web/, built into assets/web) in a
 * WebView, and a bridge (Bridge.kt) that gives it what a web page can't do on its own: Bluetooth LE,
 * the network without CORS, haptics, the wallpaper's Material You colour, and app updates.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var bridge: Bridge
    private var pendingFile: ValueCallback<Array<Uri>>? = null
    private var pendingMic: PermissionRequest? = null
    private var pendingPermissions: (() -> Unit)? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        // Edge to edge: the app draws behind the system bars and pads itself by the insets.
        window.setDecorFitsSystemWindows(false)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        web.setBackgroundColor(0)
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = sendInsets()
        }
        web.webChromeClient = object : WebChromeClient() {
            // Music mode: the microphone, asked for when the mode is picked.
            override fun onPermissionRequest(request: PermissionRequest) {
                if (!request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny(); return }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pendingMic = request
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
                }
            }

            // "Flash a firmware file (.bin)"
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                pendingFile?.onReceiveValue(null)
                pendingFile = callback
                val pick = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                startActivityForResult(Intent.createChooser(pick, "Firmware file"), REQUEST_FILE)
                return true
            }
        }
        bridge = Bridge(this, web)
        web.addJavascriptInterface(bridge, "GlowAndroid")
        web.setOnApplyWindowInsetsListener { v, insets -> sendInsets(insets); v.onApplyWindowInsets(insets) }

        // Back: the app goes back a step (a dialog, Settings, a device); at the start it closes.
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }

        if (savedInstanceState == null) web.loadUrl("https://appassets.androidplatform.net/web/index.html")
        else web.restoreState(savedInstanceState)
    }

    @Deprecated("Android 12: the back key; 13+ uses the back callback")
    override fun onBackPressed() = goBack()

    private fun goBack() {
        web.evaluateJavascript("window.__glowBack ? window.__glowBack() : false") { handled ->
            if (handled != "true") finish()
        }
    }

    /** The status and navigation bars' heights, as CSS variables the app pads itself with. */
    private fun sendInsets(insets: WindowInsets? = web.rootWindowInsets) {
        val bars = insets?.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()) ?: return
        val d = resources.displayMetrics.density
        val js = "(function(e){if(!e)return;var s=e.style;s.setProperty('--inset-top','${bars.top / d}px');s.setProperty('--inset-bottom','${bars.bottom / d}px');" +
            "s.setProperty('--inset-left','${bars.left / d}px');s.setProperty('--inset-right','${bars.right / d}px')})(document.documentElement)"
        web.post { web.evaluateJavascript(js, null) }
    }

    /** Light or dark status bar icons, to match the app's theme. */
    fun setDarkTheme(dark: Boolean) = runOnUiThread {
        val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
    }

    fun keepAwake(on: Boolean) = runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** Runs [then] once the permissions are granted (asking for the missing ones first). */
    fun withPermissions(permissions: Array<String>, then: () -> Unit, denied: () -> Unit) = runOnUiThread {
        val missing = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) { then(); return@runOnUiThread }
        pendingPermissions = { if (permissions.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) then() else denied() }
        requestPermissions(missing.toTypedArray(), REQUEST_BT)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        when (requestCode) {
            REQUEST_MIC -> {
                val ok = results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED
                pendingMic?.let { if (ok) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny() }
                pendingMic = null
            }
            REQUEST_BT -> { pendingPermissions?.invoke(); pendingPermissions = null }
        }
    }

    @Deprecated("A one-off file pick; the result API needs androidx.activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_FILE) {
            val uri = data?.data
            pendingFile?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
            pendingFile = null
        }
    }

    override fun onResume() {
        super.onResume()
        Updater.onResume(this)
        web.evaluateJavascript("window.__glowEmit && window.__glowEmit('resume', '{}')", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        bridge.close()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_MIC = 1
        private const val REQUEST_BT = 2
        private const val REQUEST_FILE = 3
    }
}


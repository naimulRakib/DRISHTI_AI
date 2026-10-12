package ai.drishti.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import ai.drishti.app.bridge.DrishtiBridge

/**
 * Main Android Activity hosting the Drishti Next.js interface inside a hardware-accelerated WebView.
 * Handles runtime permissions for camera, microphone, and location.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var drishtiBridge: DrishtiBridge? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Keep screen on when walking mode is engaged
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = findViewById(R.id.webView)
        setupWebView()
        checkAndRequestPermissions()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        drishtiBridge = DrishtiBridge(this, webView)
        webView.addJavascriptInterface(drishtiBridge!!, "DrishtiBridge")

        webView.webChromeClient = object : WebChromeClient() {
            // Automatically grant camera and audio permissions to WebView WebRTC/getUserMedia
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }

            // Automatically grant geolocation permission to WebView
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }
        }

        webView.webViewClient = object : WebViewClient() {}

        // For local development on emulator use 10.0.2.2:3000, on physical phone use computer local IP or production URL
        // Fallback default: http://10.0.2.2:3000 (emulator) or http://localhost:3000
        val targetUrl = intent.getStringExtra("EXTRA_URL") ?: "http://10.0.2.2:3000"
        webView.loadUrl(targetUrl)
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.SEND_SMS
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                missingPermissions.toTypedArray(),
                REQUEST_PERMISSIONS_CODE
            )
        }
    }

    override fun onDestroy() {
        drishtiBridge?.onDestroy()
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_PERMISSIONS_CODE = 101
    }
}

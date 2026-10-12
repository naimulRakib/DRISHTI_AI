package ai.drishti.app.bridge

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.WebView
import ai.drishti.app.server.SmartCaneServer
import ai.drishti.app.service.WalkWithMeService
import org.json.JSONObject
import java.util.Locale

/**
 * Android JavaScriptInterface bridge.
 * Injected into WebView as `window.DrishtiBridge`.
 * Connects Next.js web application with native Android hardware:
 * - FusedLocationProviderClient (1Hz GPS updates)
 * - Hardware Compass (azimuth orientation & clock directions)
 * - Foreground Service (screen-off continuous tracking)
 * - Native Fall Detection & Audible Siren Alert (ANVI Integration)
 * - Emergency Contact persistence & Automated Dispatch
 * - Smart Cane IoT Gateway (NanoHTTPD port 5000)
 * - Android Vibrator (directional haptics)
 * - Native Android TextToSpeech engine
 */
class DrishtiBridge(
    private val context: Context,
    private val webView: WebView
) : WalkWithMeService.Companion.NavEventListener {

    private var tts: TextToSpeech? = null
    private var isTtsReady = false

    init {
        WalkWithMeService.listener = this
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale("bn", "BD"))
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.language = Locale.US
                }
                isTtsReady = true
            }
        }
    }

    @JavascriptInterface
    fun isNativeAvailable(): Boolean = true

    @JavascriptInterface
    fun getPlatform(): String = "android_kotlin"

    @JavascriptInterface
    fun startWalkWithMe(destLat: Double, destLng: Double, destName: String) {
        WalkWithMeService.setTargetDestination(destLat, destLng, destName)
        val intent = Intent(context, WalkWithMeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        triggerHaptic("confirm")
    }

    @JavascriptInterface
    fun stopWalkWithMe() {
        WalkWithMeService.clearTargetDestination()
        val intent = Intent(context, WalkWithMeService::class.java)
        context.stopService(intent)
        triggerHaptic("cancel")
    }

    @JavascriptInterface
    fun setDestination(destLat: Double, destLng: Double, destName: String) {
        WalkWithMeService.setTargetDestination(destLat, destLng, destName)
    }

    // --- ANVI Safety & Fall Detection Extensions ---

    @JavascriptInterface
    fun saveEmergencyContact(phoneNumber: String) {
        WalkWithMeService.saveEmergencyContact(context, phoneNumber)
    }

    @JavascriptInterface
    fun getEmergencyContact(): String {
        return WalkWithMeService.getStoredEmergencyContact(context)
    }

    @JavascriptInterface
    fun cancelFallAlert() {
        WalkWithMeService.instance?.cancelFallAlert()
    }

    @JavascriptInterface
    fun triggerFallSimulation() {
        WalkWithMeService.instance?.triggerFallAlert()
    }

    @JavascriptInterface
    fun isFallMonitoringActive(): Boolean {
        return WalkWithMeService.instance != null
    }

    @JavascriptInterface
    fun getSmartCaneServerUrl(): String {
        val ip = SmartCaneServer.getDeviceIpAddress()
        return "http://$ip:5000"
    }

    // --- Haptics and Speech ---

    @JavascriptInterface
    fun triggerHaptic(patternType: String) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (!vibrator.hasVibrator()) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            when (patternType) {
                "turn_left" -> {
                    val timings = longArrayOf(0, 100, 80, 100)
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
                "turn_right" -> {
                    val timings = longArrayOf(0, 80, 60, 80, 60, 80)
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
                "obstacle_alert" -> {
                    vibrator.vibrate(VibrationEffect.createOneShot(350, VibrationEffect.DEFAULT_AMPLITUDE))
                }
                "confirm" -> {
                    vibrator.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
                }
                "cancel" -> {
                    val timings = longArrayOf(0, 150, 100, 150)
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
                else -> {
                    vibrator.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
                }
            }
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(100)
        }
    }

    @JavascriptInterface
    fun speakNative(text: String) {
        if (isTtsReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "DrishtiNativeTTS")
        }
    }

    // --- NavEventListener Implementations ---

    override fun onNavTick(
        lat: Double,
        lng: Double,
        heading: Float,
        destLat: Double?,
        destLng: Double?,
        destName: String?,
        distanceMeters: Float,
        clockDirection: String,
        accuracy: Float
    ) {
        val json = JSONObject().apply {
            put("lat", lat)
            put("lng", lng)
            put("heading", heading)
            put("destLat", destLat ?: JSONObject.NULL)
            put("destLng", destLng ?: JSONObject.NULL)
            put("destName", destName ?: JSONObject.NULL)
            put("distanceMeters", distanceMeters)
            put("clockDirection", clockDirection)
            put("accuracy", accuracy)
        }.toString()

        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiNavListener) { window.__drishtiNavListener($json); }",
                null
            )
        }
    }

    override fun onFallAlertTriggered(countdownSeconds: Int) {
        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiOnFallAlert) { window.__drishtiOnFallAlert({ countdownSeconds: $countdownSeconds }); }",
                null
            )
        }
    }

    override fun onFallCountdownTick(secondsRemaining: Int) {
        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiOnFallCountdownTick) { window.__drishtiOnFallCountdownTick({ secondsRemaining: $secondsRemaining }); }",
                null
            )
        }
    }

    override fun onFallAlertCancelled() {
        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiOnFallCancelled) { window.__drishtiOnFallCancelled(); }",
                null
            )
        }
    }

    override fun onMotionMagnitude(magnitude: Float) {
        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiOnMotionMagnitude) { window.__drishtiOnMotionMagnitude({ magnitude: $magnitude }); }",
                null
            )
        }
    }

    override fun onCaneImageCaptured(imagePath: String, base64Uri: String) {
        val escapedPath = JSONObject.quote(imagePath)
        val escapedBase64 = JSONObject.quote(base64Uri)
        val ip = SmartCaneServer.getDeviceIpAddress()
        val frameUrl = JSONObject.quote("http://$ip:5000/latest_frame")
        webView.post {
            webView.evaluateJavascript(
                "if (window.__drishtiOnCaneImage) { window.__drishtiOnCaneImage({ imagePath: $escapedPath, base64: $escapedBase64, frameUrl: $frameUrl }); }",
                null
            )
        }
    }

    fun onDestroy() {
        WalkWithMeService.listener = null
        tts?.stop()
        tts?.shutdown()
    }
}

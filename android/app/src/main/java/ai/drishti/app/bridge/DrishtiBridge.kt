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
                    // Fallback to default or English
                    tts?.language = Locale.US
                }
                isTtsReady = true
            }
        }
    }

    @JavascriptInterface
    fun isNativeAvailable(): Boolean {
        return true
    }

    @JavascriptInterface
    fun getPlatform(): String {
        return "android_kotlin"
    }

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
                    // Two short pulses
                    val timings = longArrayOf(0, 100, 80, 100)
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
                "turn_right" -> {
                    // Three short pulses
                    val timings = longArrayOf(0, 80, 60, 80, 60, 80)
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
                }
                "obstacle_alert" -> {
                    // Strong emergency pulse
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

    fun onDestroy() {
        WalkWithMeService.listener = null
        tts?.stop()
        tts?.shutdown()
    }
}

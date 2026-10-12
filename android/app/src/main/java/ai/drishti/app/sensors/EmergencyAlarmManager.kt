package ai.drishti.app.sensors

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * High-priority Emergency Alarm Manager.
 * Ported from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Plays a loud, unignorable siren using USAGE_ALARM and FLAG_AUDIBILITY_ENFORCED,
 * triggers emergency haptic vibrations, and counts down 12 seconds before dispatching
 * automated emergency phone calls and SMS messages.
 */
class EmergencyAlarmManager(
    private val context: Context,
    private val onTick: (secondsRemaining: Int) -> Unit,
    private val onTimeout: () -> Unit
) {

    companion object {
        private const val TAG = "EmergencyAlarmManager"
        const val DEFAULT_COUNTDOWN_SECONDS = 12
    }

    private val handler = Handler(Looper.getMainLooper())
    private var ringtone: Ringtone? = null
    private var secondsLeft = DEFAULT_COUNTDOWN_SECONDS
    private var isAlarmActive = false

    private val countdownRunnable = object : Runnable {
        override fun run() {
            if (!isAlarmActive) return

            secondsLeft--
            Log.d(TAG, "Emergency countdown: $secondsLeft seconds remaining")
            onTick(secondsLeft)

            if (secondsLeft <= 0) {
                isAlarmActive = false
                stopSiren()
                Log.w(TAG, "Countdown expired: Triggering automated emergency dispatch!")
                onTimeout()
            } else {
                handler.postDelayed(this, 1000L)
            }
        }
    }

    fun startAlarm() {
        if (isAlarmActive) return

        isAlarmActive = true
        secondsLeft = DEFAULT_COUNTDOWN_SECONDS
        Log.i(TAG, "🚨 Emergency siren activated! Countdown started: $secondsLeft seconds")

        playEmergencySiren()
        triggerEmergencyHaptics()
        onTick(secondsLeft)

        handler.postDelayed(countdownRunnable, 1000L)
    }

    fun stopAlarm() {
        if (!isAlarmActive) return

        isAlarmActive = false
        handler.removeCallbacks(countdownRunnable)
        stopSiren()
        stopHaptics()
        Log.i(TAG, "Emergency siren stopped by user or remote cancel")
    }

    fun isPlaying(): Boolean = isAlarmActive

    private fun playEmergencySiren() {
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            ringtone = RingtoneManager.getRingtone(context, alarmUri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                        .build()
                } else {
                    @Suppress("DEPRECATION")
                    streamType = AudioManager.STREAM_ALARM
                }
                play()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error playing emergency ringtone siren", e)
        }
    }

    private fun stopSiren() {
        try {
            ringtone?.let {
                if (it.isPlaying) it.stop()
            }
            ringtone = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping ringtone siren", e)
        }
    }

    private fun triggerEmergencyHaptics() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (vibrator.hasVibrator()) {
            val pattern = longArrayOf(0, 400, 200, 400, 200, 600)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0)) // Loop vibration
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, 0)
            }
        }
    }

    private fun stopHaptics() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.cancel()
    }
}

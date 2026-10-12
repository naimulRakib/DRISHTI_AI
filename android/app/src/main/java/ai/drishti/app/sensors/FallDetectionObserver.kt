package ai.drishti.app.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import kotlin.math.sqrt

/**
 * Native Fall Detection Observer using hardware Accelerometer and Gyroscope.
 * Integrated from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Implements a dual-phase human fall detection model:
 * Phase 1: Free fall weightlessness (< 8.0 m/s², normal gravity is ~9.8 m/s²)
 * Phase 2: High impact ground collision (> 12.0 m/s²) coupled with angular tumbling (> 2.0 rad/s)
 *          occurring within a 150ms - 1200ms time window.
 */
class FallDetectionObserver(
    context: Context,
    private val onFallDetected: () -> Unit,
    private val onMotionMagnitude: ((Float) -> Unit)? = null
) : SensorEventListener {

    companion object {
        private const val TAG = "FallDetectionObserver"
        const val FREE_FALL_THRESHOLD = 8.0f     // m/s²
        const val IMPACT_THRESHOLD = 12.0f       // m/s²
        const val GYRO_THRESHOLD = 2.0f          // rad/s
        const val FALL_DURATION_MIN_MS = 150L    // ms
        const val FALL_DURATION_MAX_MS = 1200L   // ms
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

    private var isFreeFalling = false
    private var fallStartTime = 0L
    private var lastGyroMagnitude = 0.0f
    private var isListening = false

    fun start() {
        if (isListening) return

        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        } ?: Log.w(TAG, "Accelerometer not available on device")

        gyroscope?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        } ?: Log.w(TAG, "Gyroscope not available on device")

        isListening = true
        Log.i(TAG, "Native FallDetectionObserver activated")
    }

    fun stop() {
        if (!isListening) return
        sensorManager.unregisterListener(this)
        isListening = false
        isFreeFalling = false
        fallStartTime = 0L
        Log.i(TAG, "Native FallDetectionObserver stopped")
    }

    fun isRunning(): Boolean = isListening

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val currentTime = System.currentTimeMillis()

        when (event.sensor?.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                val acceleration = sqrt(x * x + y * y + z * z)

                onMotionMagnitude?.invoke(acceleration)
                detectFallPattern(acceleration, currentTime)
            }

            Sensor.TYPE_GYROSCOPE -> {
                val gx = event.values[0]
                val gy = event.values[1]
                val gz = event.values[2]
                lastGyroMagnitude = sqrt(gx * gx + gy * gy + gz * gz)
            }
        }
    }

    private fun detectFallPattern(acceleration: Float, currentTime: Long) {
        // Phase 1: Free fall detection
        if (!isFreeFalling && acceleration < FREE_FALL_THRESHOLD) {
            isFreeFalling = true
            fallStartTime = currentTime
            Log.d(TAG, "Potential free fall initiated: acc=$acceleration m/s²")
            return
        }

        // Phase 2: Impact detection within valid duration window
        if (isFreeFalling) {
            val fallDuration = currentTime - fallStartTime

            val hasImpact = acceleration > IMPACT_THRESHOLD
            val hasRotation = lastGyroMagnitude > GYRO_THRESHOLD
            val validDuration = fallDuration in FALL_DURATION_MIN_MS..FALL_DURATION_MAX_MS

            if (hasImpact && (hasRotation || gyroscope == null) && validDuration) {
                isFreeFalling = false
                fallStartTime = 0L
                Log.w(
                    TAG,
                    "🚨 REAL FALL DETECTED! Duration=${fallDuration}ms, Impact=${acceleration}m/s², Gyro=${lastGyroMagnitude}rad/s"
                )
                onFallDetected()
            } else if (fallDuration > FALL_DURATION_MAX_MS) {
                // Timeout exceeded without impact: reset
                isFreeFalling = false
                fallStartTime = 0L
            }
        }

        // Reset if acceleration normalizes without impact
        if (isFreeFalling && acceleration in FREE_FALL_THRESHOLD..IMPACT_THRESHOLD) {
            val fallDuration = currentTime - fallStartTime
            if (fallDuration > 200L) {
                isFreeFalling = false
                fallStartTime = 0L
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }
}

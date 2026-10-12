package ai.drishti.app.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.roundToInt

/**
 * Manages device orientation and calculates continuous compass azimuth heading (0–360°).
 * Critical for visually impaired navigation to determine which direction the user is facing
 * and translate target bearings into intuitive clock-face directions.
 */
class CompassManager(context: Context) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    private var onHeadingChanged: ((Float) -> Unit)? = null
    private var isListening = false
    private var currentHeading: Float = 0f

    fun startListening(listener: (Float) -> Unit) {
        if (isListening) return
        this.onHeadingChanged = listener
        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            isListening = true
        }
    }

    fun stopListening() {
        if (!isListening) return
        sensorManager.unregisterListener(this)
        isListening = false
        onHeadingChanged = null
    }

    fun getHeading(): Float = currentHeading

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return

        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)

        val orientation = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, orientation)

        // Convert azimuth (orientation[0]) from radians to degrees (-180 to 180 -> 0 to 360)
        var azimuth = Math.toDegrees(orientation[0].toDouble()).toFloat()
        if (azimuth < 0) {
            azimuth += 360f
        }

        currentHeading = azimuth
        onHeadingChanged?.invoke(azimuth)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }

    companion object {
        /**
         * Translates the difference between current user heading and target destination bearing
         * into a clock-face position (e.g., 12 o'clock, 2 o'clock, 9 o'clock) in Bengali.
         */
        fun toClockDirectionBengali(currentHeading: Float, targetBearing: Float): String {
            var diff = (targetBearing - currentHeading) % 360f
            if (diff < -180f) diff += 360f
            if (diff > 180f) diff -= 360f

            // Map -180..+180 into 12 clock positions
            // 0 deg = 12 o'clock, +30 = 1 o'clock, +60 = 2 o'clock, -30 = 11 o'clock
            val hoursOffset = (diff / 30f).roundToInt()
            var clockHour = (12 + hoursOffset) % 12
            if (clockHour == 0) clockHour = 12

            val bengaliDigits = mapOf(
                1 to "১", 2 to "২", 3 to "৩", 4 to "৪", 5 to "৫", 6 to "৬",
                7 to "৭", 8 to "৮", 9 to "৯", 10 to "১০", 11 to "১১", 12 to "১২"
            )

            val bengaliHour = bengaliDigits[clockHour] ?: "$clockHour"
            return when (clockHour) {
                12 -> "১২টার দিকে সোজা চলুন"
                1, 2 -> "$bengaliHourটার দিকে সামান্য ডানে এগোন"
                3 -> "৩টার দিকে ডানপাশে ঘুরুন"
                4, 5 -> "$bengaliHourটার দিকে পেছন-ডানে ঘুরুন"
                6 -> "৬টার দিকে সম্পূর্ণ পেছনে ঘুরুন"
                7, 8 -> "$bengaliHourটার দিকে পেছন-বাঁয়ে ঘুরুন"
                9 -> "৯টার দিকে বামপাশে ঘুরুন"
                10, 11 -> "$bengaliHourটার দিকে সামান্য বাঁয়ে এগোন"
                else -> "সোজা চলুন"
            }
        }
    }
}

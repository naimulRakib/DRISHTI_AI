package ai.drishti.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import ai.drishti.app.location.LocationTracker
import ai.drishti.app.sensors.CompassManager

/**
 * Foreground Service for continuous Walk With Me navigation.
 * Prevents Android from killing GPS, sensors, or background execution
 * when the screen turns off or when the user walks with the phone.
 */
class WalkWithMeService : Service() {

    private lateinit var locationTracker: LocationTracker
    private lateinit var compassManager: CompassManager
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        instance = this

        locationTracker = LocationTracker(this)
        compassManager = CompassManager(this)

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "DrishtiAI:WalkWithMeWakeLock"
        ).apply {
            setReferenceCounted(false)
            acquire(60 * 60 * 1000L) // 1 hour max safety limit
        }

        createNotificationChannel()
        val notification = createNotification("হাঁটার সঙ্গী সক্রিয়", "জিপিএস ও দিকনির্দেশনা শুরু হচ্ছে…")
        startForeground(NOTIFICATION_ID, notification)

        startSensors()
    }

    private fun startSensors() {
        locationTracker.startTracking { loc ->
            currentLat = loc.latitude
            currentLng = loc.longitude
            currentAccuracy = loc.accuracy

            broadcastUpdate()
        }

        compassManager.startListening { heading ->
            currentHeading = heading
            broadcastUpdate()
        }
    }

    private fun broadcastUpdate() {
        val dest = destination
        val navGuidance = if (dest != null) {
            locationTracker.getNavGuidance(dest.lat, dest.lng)
        } else null

        val clockDir = if (navGuidance != null) {
            CompassManager.toClockDirectionBengali(currentHeading, navGuidance.bearingDegrees)
        } else ""

        val distance = navGuidance?.distanceMeters ?: 0f

        updateNotification(
            "দৃষ্টি হাঁটার সঙ্গী: ${if (dest != null) dest.name else "চলমান"}",
            if (dest != null) "দূরত্ব: ${distance.toInt()}মি | $clockDir" else "দিক: ${currentHeading.toInt()}°"
        )

        listener?.onNavTick(
            lat = currentLat,
            lng = currentLng,
            heading = currentHeading,
            destLat = dest?.lat,
            destLng = dest?.lng,
            destName = dest?.name,
            distanceMeters = distance,
            clockDirection = clockDir,
            accuracy = currentAccuracy
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "হাঁটার সঙ্গী (Walk With Me)",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "রিয়েল-টাইম জিপিএস এবং ভিশন অ্যাসিস্ট্যান্ট চালুকরণ"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(title: String, text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, createNotification(title, text))
    }

    override fun onDestroy() {
        locationTracker.stopTracking()
        compassManager.stopListening()
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "drishti_walk_service_channel"
        const val NOTIFICATION_ID = 2001

        var instance: WalkWithMeService? = null
            private set

        var listener: NavEventListener? = null

        var currentLat: Double = 0.0
        var currentLng: Double = 0.0
        var currentHeading: Float = 0f
        var currentAccuracy: Float = 0f

        data class Destination(val lat: Double, val lng: Double, val name: String)
        var destination: Destination? = null

        fun setTargetDestination(lat: Double, lng: Double, name: String) {
            destination = Destination(lat, lng, name)
            instance?.broadcastUpdate()
        }

        fun clearTargetDestination() {
            destination = null
            instance?.broadcastUpdate()
        }

        interface NavEventListener {
            fun onNavTick(
                lat: Double,
                lng: Double,
                heading: Float,
                destLat: Double?,
                destLng: Double?,
                destName: String?,
                distanceMeters: Float,
                clockDirection: String,
                accuracy: Float
            )
        }
    }
}

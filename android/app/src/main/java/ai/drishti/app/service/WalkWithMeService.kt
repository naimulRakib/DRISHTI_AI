package ai.drishti.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import ai.drishti.app.location.LocationTracker
import ai.drishti.app.sensors.CompassManager
import ai.drishti.app.sensors.EmergencyAlarmManager
import ai.drishti.app.sensors.FallDetectionObserver
import ai.drishti.app.server.SmartCaneServer
import java.io.File

/**
 * Foreground Service for continuous Walk With Me navigation and 24/7 background Fall Detection.
 * Integrated with ANVI (https://github.com/naimulRakib/ANVI) for life-saving emergency response.
 *
 * Keeps sensors, GPS, and IoT server active even when the screen is locked or in pocket.
 */
class WalkWithMeService : Service() {

    private lateinit var locationTracker: LocationTracker
    private lateinit var compassManager: CompassManager
    private var fallDetectionObserver: FallDetectionObserver? = null
    private var emergencyAlarmManager: EmergencyAlarmManager? = null
    private var smartCaneServer: SmartCaneServer? = null
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
            acquire(2 * 60 * 60 * 1000L) // 2 hours max safety limit
        }

        createNotificationChannels()
        val notification = createNotification("দৃষ্টি হাঁটার সঙ্গী ও নিরাপত্তা সক্রিয়", "জিপিএস ও পতন পর্যবেক্ষণ চলছে…")
        startForeground(NOTIFICATION_ID, notification)

        initEmergencyAlarm()
        initFallDetection()
        initSmartCaneServer()
        startSensors()
    }

    private fun initEmergencyAlarm() {
        emergencyAlarmManager = EmergencyAlarmManager(
            context = this,
            onTick = { secondsLeft ->
                Log.d(TAG, "Fall countdown: $secondsLeft s remaining")
                showFallAlertNotification(secondsLeft)
                listener?.onFallCountdownTick(secondsLeft)
            },
            onTimeout = {
                Log.w(TAG, "Fall countdown expired without cancel -> Executing emergency dispatch!")
                dispatchEmergencyResponse()
            }
        )
    }

    private fun initFallDetection() {
        fallDetectionObserver = FallDetectionObserver(
            context = this,
            onFallDetected = {
                triggerFallAlert()
            },
            onMotionMagnitude = { mag ->
                listener?.onMotionMagnitude(mag)
            }
        )
        fallDetectionObserver?.start()
    }

    private fun initSmartCaneServer() {
        try {
            smartCaneServer = SmartCaneServer(
                port = 5000,
                context = this,
                onImageReceived = { file, base64Uri ->
                    listener?.onCaneImageCaptured(file.absolutePath, base64Uri)
                },
                onStopAlarmRequested = {
                    cancelFallAlert()
                }
            )
            smartCaneServer?.start()
            Log.i(TAG, "Smart Cane IoT server listening on port 5000 (IP: ${SmartCaneServer.getDeviceIpAddress()})")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting SmartCaneServer", e)
        }
    }

    fun triggerFallAlert() {
        if (isFallAlertActive) return
        isFallAlertActive = true

        Log.w(TAG, "🚨 Triggering Fall Alert Siren & 12-second countdown!")
        emergencyAlarmManager?.startAlarm()
        showFallAlertNotification(EmergencyAlarmManager.DEFAULT_COUNTDOWN_SECONDS)
        listener?.onFallAlertTriggered(EmergencyAlarmManager.DEFAULT_COUNTDOWN_SECONDS)
    }

    fun cancelFallAlert() {
        if (!isFallAlertActive && emergencyAlarmManager?.isPlaying() != true) return

        isFallAlertActive = false
        emergencyAlarmManager?.stopAlarm()
        dismissFallAlertNotification()

        val notification = createNotification("দৃষ্টি সক্রিয়", "পতন সতর্কতা বাতিল করা হয়েছে। পর্যবেক্ষণ চালু আছে।")
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, notification)

        listener?.onFallAlertCancelled()
        Log.i(TAG, "Fall alert successfully cancelled")
    }

    private fun dispatchEmergencyResponse() {
        isFallAlertActive = false
        val contactNumber = getStoredEmergencyContact(this)

        // 1. Send SMS with exact Google Maps coordinates
        sendEmergencySms(contactNumber, currentLat, currentLng)

        // 2. Launch full-screen emergency call screen to dial caregiver
        launchEmergencyCallActivity(contactNumber, currentLat, currentLng)
    }

    private fun sendEmergencySms(phoneNumber: String, lat: Double, lng: Double) {
        if (phoneNumber.isBlank()) {
            Log.e(TAG, "No emergency contact configured. Cannot send SMS.")
            return
        }

        try {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
                val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }

                val mapsLink = if (lat != 0.0 && lng != 0.0) {
                    "https://maps.google.com/?q=$lat,$lng"
                } else {
                    "অবস্থান নির্ণয় করা সম্ভব হয়নি"
                }

                val message = "জরুরি সতর্কতা! দৃষ্টি (DRISHTI AI) ব্যবহারকারীর সম্ভাব্য পতন সনাক্ত করেছে এবং ব্যবহারকারীর কোনো সাড়া পাওয়া যায়নি।\nবর্তমান অবস্থান: $mapsLink"
                val parts = smsManager.divideMessage(message)

                if (parts.size > 1) {
                    smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
                } else {
                    smsManager.sendTextMessage(phoneNumber, null, message, null, null)
                }
                Log.i(TAG, "✅ Emergency SMS successfully sent to $phoneNumber")
            } else {
                Log.w(TAG, "SEND_SMS permission not granted; SMS skipped.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending emergency SMS", e)
        }
    }

    private fun launchEmergencyCallActivity(phoneNumber: String, lat: Double, lng: Double) {
        val intent = Intent(this, EmergencyCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EmergencyCallActivity.EXTRA_PHONE_NUMBER, phoneNumber)
            putExtra(EmergencyCallActivity.EXTRA_LATITUDE, lat)
            putExtra(EmergencyCallActivity.EXTRA_LONGITUDE, lng)
        }
        startActivity(intent)
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

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val navChannel = NotificationChannel(
                CHANNEL_ID,
                "হাঁটার সঙ্গী (Walk With Me)",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "রিয়েল-টাইম জিপিএস এবং ভিশন অ্যাসিস্ট্যান্ট চালুকরণ"
            }

            val alertChannel = NotificationChannel(
                ALERT_CHANNEL_ID,
                "জরুরি পতন সতর্কতা (Emergency Fall Alert)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "পতন সনাক্তকরণ ও জরুরি কল অ্যালার্ট"
                enableLights(true)
                enableVibration(true)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(navChannel)
            manager?.createNotificationChannel(alertChannel)
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
        if (isFallAlertActive) return // Don't overwrite critical fall alert
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, createNotification(title, text))
    }

    private fun showFallAlertNotification(secondsLeft: Int) {
        val fullScreenIntent = Intent(this, EmergencyCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EmergencyCallActivity.EXTRA_PHONE_NUMBER, getStoredEmergencyContact(this@WalkWithMeService))
            putExtra(EmergencyCallActivity.EXTRA_LATITUDE, currentLat)
            putExtra(EmergencyCallActivity.EXTRA_LONGITUDE, currentLng)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            0,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val notification = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setContentTitle("🚨 সম্ভাব্য পতন সনাক্ত হয়েছে!")
            .setContentText("বাতিল না করলে $secondsLeft সেকেন্ডে স্বয়ংক্রিয় জরুরি কল করা হবে।")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setOngoing(true)
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(ALERT_NOTIFICATION_ID, notification)
    }

    private fun dismissFallAlertNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(ALERT_NOTIFICATION_ID)
    }

    override fun onDestroy() {
        fallDetectionObserver?.stop()
        emergencyAlarmManager?.stopAlarm()
        smartCaneServer?.stop()
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
        private const val TAG = "WalkWithMeService"
        const val CHANNEL_ID = "drishti_walk_service_channel"
        const val ALERT_CHANNEL_ID = "drishti_emergency_alert_channel"
        const val NOTIFICATION_ID = 2001
        const val ALERT_NOTIFICATION_ID = 9999

        private const val PREFS_NAME = "drishti_safety_prefs"
        private const val KEY_EMERGENCY_CONTACT = "emergency_contact"

        var instance: WalkWithMeService? = null
            private set

        var listener: NavEventListener? = null
        var isFallAlertActive: Boolean = false
            private set

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

        fun saveEmergencyContact(context: Context, phoneNumber: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_EMERGENCY_CONTACT, phoneNumber.trim()).apply()
        }

        fun getStoredEmergencyContact(context: Context): String {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getString(KEY_EMERGENCY_CONTACT, "") ?: ""
        }

        fun sendCustomSms(context: Context, phoneNumber: String, message: String) {
            if (phoneNumber.isBlank()) return
            try {
                if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.SEND_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    val smsManager = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                        context.getSystemService(android.telephony.SmsManager::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        android.telephony.SmsManager.getDefault()
                    }
                    val parts = smsManager.divideMessage(message)
                    if (parts.size > 1) {
                        smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
                    } else {
                        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
                    }
                    android.util.Log.i(TAG, "✅ Custom SMS successfully sent to $phoneNumber")
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Error sending custom SMS", e)
            }
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

            fun onFallAlertTriggered(countdownSeconds: Int)
            fun onFallCountdownTick(secondsRemaining: Int)
            fun onFallAlertCancelled()
            fun onMotionMagnitude(magnitude: Float)
            fun onCaneImageCaptured(imagePath: String, base64Uri: String)
        }
    }
}

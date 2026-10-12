package ai.drishti.app.service

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import ai.drishti.app.R

/**
 * Full-screen Emergency Call Activity displayed when a fall countdown expires.
 * Ported and enhanced from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Configured with flags to wake up locked screens, dismiss keyguards, and directly
 * dial the registered caregiver / emergency contact phone number.
 */
class EmergencyCallActivity : AppCompatActivity() {

    private var phoneNumber: String = ""
    private var latitude: Double = 0.0
    private var longitude: Double = 0.0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Ensure activity wakes up the device even when locked and asleep
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        setContentView(R.layout.activity_emergency_call)

        phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER) ?: ""
        latitude = intent.getDoubleExtra(EXTRA_LATITUDE, 0.0)
        longitude = intent.getDoubleExtra(EXTRA_LONGITUDE, 0.0)

        val tvContactNumber = findViewById<TextView>(R.id.tvContactNumber)
        val tvLocationDetails = findViewById<TextView>(R.id.tvLocationDetails)
        val btnCallNow = findViewById<Button>(R.id.btnCallNow)
        val btnCancelEmergency = findViewById<Button>(R.id.btnCancelEmergency)

        if (phoneNumber.isNotEmpty()) {
            tvContactNumber.text = phoneNumber
        } else {
            tvContactNumber.text = "জরুরি নম্বর নির্ধারিত নেই (999 এ কল করুন)"
        }

        if (latitude != 0.0 && longitude != 0.0) {
            tvLocationDetails.text = "জিপিএস অবস্থান: $latitude, $longitude\nমানচিত্র: maps.google.com/?q=$latitude,$longitude"
        }

        btnCallNow.setOnClickListener {
            dialEmergencyContact()
        }

        btnCancelEmergency.setOnClickListener {
            WalkWithMeService.instance?.cancelFallAlert()
            Toast.makeText(this, "জরুরি সতর্কতা বাতিল করা হয়েছে", Toast.LENGTH_SHORT).show()
            finish()
        }

        // Auto-dial after 2 seconds if phone number is present
        if (phoneNumber.isNotEmpty()) {
            Handler(Looper.getMainLooper()).postDelayed({
                if (!isFinishing) {
                    dialEmergencyContact()
                }
            }, 2000L)
        }
    }

    private fun dialEmergencyContact() {
        val targetNumber = if (phoneNumber.isNotEmpty()) phoneNumber else "999"

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            val callIntent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$targetNumber")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(callIntent)
            finish()
        } else {
            // Fallback to ACTION_DIAL if CALL_PHONE permission is not granted
            val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:$targetNumber")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(dialIntent)
            finish()
        }
    }

    companion object {
        const val EXTRA_PHONE_NUMBER = "extra_phone_number"
        const val EXTRA_LATITUDE = "extra_latitude"
        const val EXTRA_LONGITUDE = "extra_longitude"
    }
}

package ai.drishti.app.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * FusedLocationProviderClient wrapper for high-frequency (1Hz), high-accuracy GPS tracking
 * during "Walk With Me" active navigation mode.
 */
class LocationTracker(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private var locationCallback: LocationCallback? = null
    private var isTracking = false
    private var lastLocation: Location? = null

    @SuppressLint("MissingPermission")
    fun startTracking(onLocationUpdate: (Location) -> Unit) {
        if (isTracking) return

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setMinUpdateIntervalMillis(500L)
            .setMinUpdateDistanceMeters(0.5f)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { loc ->
                    lastLocation = loc
                    onLocationUpdate(loc)
                }
            }
        }

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback!!,
            Looper.getMainLooper()
        )
        isTracking = true
    }

    fun stopTracking() {
        if (!isTracking) return
        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }
        locationCallback = null
        isTracking = false
    }

    fun getLastLocation(): Location? = lastLocation

    /**
     * Calculates distance and bearing to destination
     */
    fun getNavGuidance(
        destLat: Double,
        destLng: Double
    ): NavInfo? {
        val current = lastLocation ?: return null
        val results = FloatArray(2)
        Location.distanceBetween(
            current.latitude, current.longitude,
            destLat, destLng,
            results
        )
        val distanceMeters = results[0]
        var bearingDegrees = results[1]
        if (bearingDegrees < 0) {
            bearingDegrees += 360f
        }
        return NavInfo(
            distanceMeters = distanceMeters,
            bearingDegrees = bearingDegrees,
            accuracyMeters = current.accuracy,
            latitude = current.latitude,
            longitude = current.longitude
        )
    }

    data class NavInfo(
        val distanceMeters: Float,
        val bearingDegrees: Float,
        val accuracyMeters: Float,
        val latitude: Double,
        val longitude: Double
    )
}

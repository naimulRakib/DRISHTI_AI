package ai.drishti.app.server

import android.content.Context
import android.util.Base64
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.io.FileInputStream
import java.net.NetworkInterface

/**
 * Embedded NanoHTTPD IoT Server listening on port 5000.
 * Directly integrates Raspberry Pi Smart Cane peripherals from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Endpoints:
 * - POST /upload: Ingests raw photo bytes captured by the smart cane's hardware push-button
 * - GET /latest_frame: Serves the last captured camera frame to WebView and companion browsers
 * - POST /stopalarm: Cancels an active fall detection emergency siren triggered by the user's cane
 * - POST /distance: Receives real-time ultrasonic proximity measurements from the physical cane
 * - GET /status: Reports IoT bridge status, battery, and server health
 */
class SmartCaneServer(
    port: Int = 5000,
    private val context: Context,
    private val onImageReceived: (imageFile: File, base64Uri: String) -> Unit,
    private val onStopAlarmRequested: () -> Unit,
    private val onDistanceReceived: ((distanceCm: Float) -> Unit)? = null
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "SmartCaneServer"
        const val DEFAULT_PORT = 5000

        fun getDeviceIpAddress(): String {
            try {
                val interfaces = NetworkInterface.getNetworkInterfaces()
                for (intf in interfaces) {
                    val addrs = intf.inetAddresses
                    for (addr in addrs) {
                        if (!addr.isLoopbackAddress) {
                            val host = addr.hostAddress
                            if (host != null && !host.contains(":")) {
                                return host
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error acquiring Wi-Fi IP address", e)
            }
            return "127.0.0.1"
        }
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        Log.d(TAG, "Incoming IoT request: $method $uri")

        // 1. Hardware Cane Camera Photo Upload
        if (method == Method.POST && uri == "/upload") {
            return try {
                val contentLength = session.headers["content-length"]?.toIntOrNull() ?: 0
                val body = ByteArray(contentLength)
                var totalRead = 0

                while (totalRead < contentLength) {
                    val read = session.inputStream.read(body, totalRead, contentLength - totalRead)
                    if (read == -1) break
                    totalRead += read
                }

                val caneImage = File(context.cacheDir, "smart_cane_frame.jpg")
                caneImage.writeBytes(body)

                val base64Data = Base64.encodeToString(body, Base64.NO_WRAP)
                val base64Uri = "data:image/jpeg;base64,$base64Data"

                Log.i(TAG, "Received image frame from Smart Cane: $totalRead bytes saved to ${caneImage.absolutePath}")
                onImageReceived(caneImage, base64Uri)

                val response = newFixedLengthResponse(
                    Response.Status.OK,
                    "application/json",
                    """{"status":"ok","bytes":$totalRead,"message":"Frame received successfully"}"""
                )
                response.addHeader("Access-Control-Allow-Origin", "*")
                response
            } catch (e: Exception) {
                Log.e(TAG, "Error processing cane image upload", e)
                newFixedLengthResponse(
                    Response.Status.INTERNAL_ERROR,
                    "application/json",
                    """{"status":"error","message":"${e.message}"}"""
                )
            }
        }

        // 2. Serve the latest camera frame to WebView / browsers
        if (method == Method.GET && (uri == "/latest_frame" || uri == "/image/latest" || uri == "/smart_cane_frame.jpg")) {
            val caneImage = File(context.cacheDir, "smart_cane_frame.jpg")
            return if (caneImage.exists() && caneImage.length() > 0) {
                val response = newChunkedResponse(
                    Response.Status.OK,
                    "image/jpeg",
                    FileInputStream(caneImage)
                )
                response.addHeader("Access-Control-Allow-Origin", "*")
                response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                response
            } else {
                newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No frame captured yet")
            }
        }

        // 3. Hardware Cane Alarm Cancellation
        if (method == Method.POST && uri == "/stopalarm") {
            Log.w(TAG, "Hardware Stop Alarm triggered from Smart Cane button!")
            onStopAlarmRequested()
            val response = newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                """{"status":"ok","message":"Fall alarm cancelled via smart cane"}"""
            )
            response.addHeader("Access-Control-Allow-Origin", "*")
            return response
        }

        // 4. Hardware Cane Ultrasonic Distance Telemetry
        if (method == Method.POST && (uri == "/distance" || uri == "/sensor/distance")) {
            return try {
                val contentLength = session.headers["content-length"]?.toIntOrNull() ?: 0
                val body = ByteArray(contentLength)
                var totalRead = 0
                while (totalRead < contentLength) {
                    val read = session.inputStream.read(body, totalRead, contentLength - totalRead)
                    if (read == -1) break
                    totalRead += read
                }
                val text = String(body)
                val json = org.json.JSONObject(text)
                val dist = json.optDouble("distanceCm", json.optDouble("distance", -1.0)).toFloat()
                if (dist >= 0) {
                    onDistanceReceived?.invoke(dist)
                }
                val response = newFixedLengthResponse(
                    Response.Status.OK,
                    "application/json",
                    """{"status":"ok","distanceCm":$dist}"""
                )
                response.addHeader("Access-Control-Allow-Origin", "*")
                response
            } catch (e: Exception) {
                newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Invalid distance payload")
            }
        }

        // 5. IoT Status check
        if (uri == "/status") {
            val response = newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                """{"status":"online","system":"DRISHTI_AI","version":"1.0.0","ip":"${getDeviceIpAddress()}"}"""
            )
            response.addHeader("Access-Control-Allow-Origin", "*")
            return response
        }

        val response = newFixedLengthResponse(
            Response.Status.OK,
            "text/plain",
            "DRISHTI AI Smart Cane IoT Gateway Active on port 5000"
        )
        response.addHeader("Access-Control-Allow-Origin", "*")
        return response
    }
}

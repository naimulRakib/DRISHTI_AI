package ai.drishti.app.server

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.net.NetworkInterface

/**
 * Embedded NanoHTTPD IoT Server listening on port 5000.
 * Directly integrates Raspberry Pi Smart Cane peripherals from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Endpoints:
 * - POST /upload: Ingests raw photo bytes captured by the smart cane's hardware push-button
 * - POST /stopalarm: Cancels an active fall detection emergency siren triggered by the user's cane
 * - GET /status: Reports IoT bridge status, battery, and server health
 */
class SmartCaneServer(
    port: Int = 5000,
    private val context: Context,
    private val onImageReceived: (imageFile: File) -> Unit,
    private val onStopAlarmRequested: () -> Unit
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

                Log.i(TAG, "Received image frame from Smart Cane: $totalRead bytes saved to ${caneImage.absolutePath}")
                onImageReceived(caneImage)

                newFixedLengthResponse(
                    Response.Status.OK,
                    "application/json",
                    """{"status":"ok","bytes":$totalRead,"message":"Frame received successfully"}"""
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error processing cane image upload", e)
                newFixedLengthResponse(
                    Response.Status.INTERNAL_ERROR,
                    "application/json",
                    """{"status":"error","message":"${e.message}"}"""
                )
            }
        }

        // 2. Hardware Cane Alarm Cancellation
        if (method == Method.POST && uri == "/stopalarm") {
            Log.w(TAG, "Hardware Stop Alarm triggered from Smart Cane button!")
            onStopAlarmRequested()
            return newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                """{"status":"ok","message":"Fall alarm cancelled via smart cane"}"""
            )
        }

        // 3. IoT Status check
        if (uri == "/status") {
            return newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                """{"status":"online","system":"DRISHTI_AI","version":"1.0.0","ip":"${getDeviceIpAddress()}"}"""
            )
        }

        return newFixedLengthResponse(
            Response.Status.OK,
            "text/plain",
            "DRISHTI AI Smart Cane IoT Gateway Active on port 5000"
        )
    }
}

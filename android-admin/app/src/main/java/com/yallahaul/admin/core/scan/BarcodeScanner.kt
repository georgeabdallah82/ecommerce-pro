package com.yallahaul.admin.core.scan

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Scans a product barcode with the camera, using Google's scanner from Play services: it opens its
 * own camera screen, so the app needs no camera permission and never sees the camera feed.
 */
object BarcodeScanner {
    sealed interface Result {
        data class Code(val value: String) : Result
        data object Cancelled : Result
        data class Unavailable(val message: String) : Result
    }

    suspend fun scan(context: Context): Result = suspendCancellableCoroutine { cont ->
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_CODE_93, Barcode.FORMAT_ITF, Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX)
            .enableAutoZoom()
            .build()
        runCatching {
            GmsBarcodeScanning.getClient(context, options).startScan()
                .addOnSuccessListener { barcode ->
                    val value = barcode.rawValue?.trim().orEmpty()
                    if (cont.isActive) cont.resume(if (value.isEmpty()) Result.Cancelled else Result.Code(value.take(80)))
                }
                .addOnCanceledListener { if (cont.isActive) cont.resume(Result.Cancelled) }
                .addOnFailureListener { if (cont.isActive) cont.resume(Result.Unavailable("The scanner couldn't start. Update Google Play services, or type the code.")) }
        }.onFailure { if (cont.isActive) cont.resume(Result.Unavailable("The scanner isn't available on this phone. Type the code instead.")) }
    }
}

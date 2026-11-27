package com.yallahaul.admin.core.notifications

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.data.AlertsRepository
import com.yallahaul.admin.core.network.ApiResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Connects this phone to the store's alerts after sign-in. With Firebase set up on both sides the
 * server pushes alerts instantly; otherwise the phone checks the alert history every 15 minutes
 * ([AlertPollWorker]), so alerts still arrive without Firebase.
 */
@Singleton
class PushRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val alerts: AlertsRepository,
) {
    suspend fun register() {
        val token = firebaseToken()
        val result = alerts.register(token)
        val pushWorks = token != null && result is ApiResult.Success && result.data.pushConfigured && result.data.hasPushToken
        if (pushWorks) cancelPolling() else schedulePolling()
    }

    suspend fun onNewToken(token: String) { alerts.register(token) }

    fun schedulePolling() {
        val request = PeriodicWorkRequestBuilder<AlertPollWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(AlertPollWorker.NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun cancelPolling() { WorkManager.getInstance(context).cancelUniqueWork(AlertPollWorker.NAME) }

    fun stop() {
        cancelPolling()
        if (firebaseReady()) runCatching { FirebaseMessaging.getInstance().deleteToken() }
    }

    private fun firebaseReady() = BuildConfig.FIREBASE_ENABLED && runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)

    private suspend fun firebaseToken(): String? {
        if (!firebaseReady()) return null
        return suspendCancellableCoroutine { cont ->
            runCatching {
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { cont.resume(it) }
                    .addOnFailureListener { cont.resume(null) }
            }.onFailure { cont.resume(null) }
        }
    }
}

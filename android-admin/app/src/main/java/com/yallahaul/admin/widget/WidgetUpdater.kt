package com.yallahaul.admin.widget

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.yallahaul.admin.core.data.DashboardRepository
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Keeps the home-screen widget current: every 30 minutes while signed in, and cleared on sign-out. */
@Singleton
class WidgetUpdater @Inject constructor(@ApplicationContext private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun schedule() = runCatching {
        val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val work = WorkManager.getInstance(context)
        work.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.UPDATE, PeriodicWorkRequestBuilder<WidgetRefreshWorker>(30, TimeUnit.MINUTES).setConstraints(network).build())
        work.enqueueUniqueWork("$NAME-now", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<WidgetRefreshWorker>().setConstraints(network).build())
    }

    fun signedOut() {
        runCatching { WorkManager.getInstance(context).cancelUniqueWork(NAME) }
        scope.launch { runCatching { WidgetStore.clear(context) } }
    }

    private companion object { const val NAME = "yallahaul-widget" }
}

@HiltWorker
class WidgetRefreshWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val session: SessionManager,
    private val dashboard: DashboardRepository,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (session.state.value is SessionState.Loading) session.restore()
        if (session.state.value !is SessionState.SignedIn) { WidgetStore.clear(applicationContext); return Result.success() }
        return when (val r = dashboard.load(7)) {
            is ApiResult.Success -> { if (r.cachedAt == null) WidgetStore.save(applicationContext, r.data); Result.success() }
            is ApiResult.Failure -> if (r.error.isAuth) { WidgetStore.clear(applicationContext); Result.success() } else Result.retry()
        }
    }
}

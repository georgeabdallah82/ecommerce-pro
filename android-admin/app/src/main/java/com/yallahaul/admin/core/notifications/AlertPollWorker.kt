package com.yallahaul.admin.core.notifications

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.yallahaul.admin.core.data.AlertsRepository
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.prefs.AppPreferences
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/** Without Firebase: every 15 minutes, shows the alerts that arrived since the last check. */
@HiltWorker
class AlertPollWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val session: SessionManager,
    private val alerts: AlertsRepository,
    private val prefs: AppPreferences,
    private val notifier: AlertNotifier,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (session.state.value is SessionState.Loading) session.restore()
        if (session.state.value !is SessionState.SignedIn) return Result.success()
        val since = prefs.lastAlertSeen()
        return when (val result = alerts.since(since)) {
            is ApiResult.Failure -> if (result.error.isAuth) Result.success() else Result.retry()
            is ApiResult.Success -> {
                val fresh = result.data.items.filter { !it.read }
                // The first check after sign-in only sets the starting point: no flood of old alerts.
                if (since != null) {
                    if (fresh.size > 4) notifier.show("${fresh.size} new alerts", fresh.take(3).joinToString(" · ") { it.title }, "orders", "/admin/alerts", tag = "digest")
                    else fresh.reversed().forEach { notifier.show(it.title, it.body, it.kind, it.path, tag = it.id) }
                }
                val newest = result.data.items.maxOfOrNull { it.createdAt } ?: since ?: java.time.Instant.now().toString()
                prefs.setLastAlertSeen(newest)
                Result.success()
            }
        }
    }

    companion object { const val NAME = "yallahaul-alert-poll" }
}

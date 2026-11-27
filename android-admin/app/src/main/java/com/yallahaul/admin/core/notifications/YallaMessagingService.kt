package com.yallahaul.admin.core.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Alerts pushed by the store through Firebase (data messages: lib/mobile-devices.ts on the server). */
@AndroidEntryPoint
class YallaMessagingService : FirebaseMessagingService() {
    @Inject lateinit var notifier: AlertNotifier
    @Inject lateinit var registrar: PushRegistrar
    @Inject lateinit var session: SessionManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: message.notification?.title ?: return
        notifier.show(
            title = title,
            body = data["body"] ?: message.notification?.body.orEmpty(),
            kind = data["kind"] ?: "messages",
            path = data["path"] ?: "/admin",
            tag = data["tag"],
        )
    }

    override fun onNewToken(token: String) {
        scope.launch {
            if (session.state.value is SessionState.Loading) session.restore()
            if (session.state.value is SessionState.SignedIn) registrar.onNewToken(token)
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}

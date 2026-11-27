package com.yallahaul.admin.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.AuthRepository
import com.yallahaul.admin.core.notifications.AlertNotifier
import com.yallahaul.admin.core.notifications.PushRegistrar
import com.yallahaul.admin.core.prefs.AppPreferences
import com.yallahaul.admin.core.prefs.UiPrefs
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** App-wide state: who is signed in, appearance, the app lock and links opened from notifications. */
@HiltViewModel
class RootViewModel @Inject constructor(
    private val sessionManager: SessionManager,
    private val auth: AuthRepository,
    private val prefs: AppPreferences,
    private val registrar: PushRegistrar,
    private val notifier: AlertNotifier,
    private val cache: com.yallahaul.admin.core.cache.ResponseCache,
    private val widgets: com.yallahaul.admin.widget.WidgetUpdater,
) : ViewModel() {
    val session: StateFlow<SessionState> = sessionManager.state

    val uiPrefs: StateFlow<UiPrefs> = prefs.uiPrefs.stateIn(viewModelScope, SharingStarted.Eagerly, UiPrefs())

    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    private val _pendingPath = MutableStateFlow<String?>(null)
    val pendingPath: StateFlow<String?> = _pendingPath.asStateFlow()

    private var previous: SessionState = SessionState.Loading

    init {
        viewModelScope.launch {
            sessionManager.restore()
            // Cold start with the app lock on: ask before showing anything.
            if (sessionManager.state.value is SessionState.SignedIn && prefs.uiPrefs.first().appLock) _locked.value = true
        }
        viewModelScope.launch {
            sessionManager.state.collect { state ->
                if (state is SessionState.SignedIn && previous !is SessionState.SignedIn) {
                    launch { auth.refreshAccount() }
                    launch { runCatching { registrar.register() } }
                    widgets.schedule()
                }
                if (state is SessionState.SignedOut && previous is SessionState.SignedIn) {
                    registrar.stop()
                    notifier.clearAll()
                    // Nothing of the store stays on the phone after signing out or a lapsed session.
                    cache.clear()
                    widgets.signedOut()
                    _locked.value = false
                }
                previous = state
            }
        }
    }

    fun lockIfEnabled() {
        viewModelScope.launch {
            if (sessionManager.state.value is SessionState.SignedIn && prefs.uiPrefs.first().appLock) _locked.value = true
        }
    }

    fun unlock() { _locked.value = false }

    /** Android 13+: ask once, after the first sign-in, whether the app may show alerts. */
    suspend fun shouldAskForNotifications(): Boolean {
        if (prefs.notificationsAsked()) return false
        prefs.setNotificationsAsked()
        return true
    }

    fun notificationsAnswered(granted: Boolean) {
        if (granted) viewModelScope.launch { runCatching { registrar.register() } }
    }

    fun openPath(path: String) { _pendingPath.value = path }
    fun consumePath() { _pendingPath.value = null }
}

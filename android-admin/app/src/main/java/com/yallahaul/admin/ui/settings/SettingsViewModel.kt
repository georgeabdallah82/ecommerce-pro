package com.yallahaul.admin.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.AlertsRepository
import com.yallahaul.admin.core.data.AuthRepository
import com.yallahaul.admin.core.data.ProfileRepository
import com.yallahaul.admin.core.model.AlertPrefs
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.notifications.AlertNotifier
import com.yallahaul.admin.core.notifications.PushRegistrar
import com.yallahaul.admin.core.prefs.AppPreferences
import com.yallahaul.admin.core.prefs.ThemeMode
import com.yallahaul.admin.core.prefs.UiPrefs
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: AppPreferences,
    private val alerts: AlertsRepository,
    private val auth: AuthRepository,
    private val profile: ProfileRepository,
    private val notifier: AlertNotifier,
    private val registrar: PushRegistrar,
) : ViewModel() {
    data class UiState(
        val prefs: AlertPrefs = AlertPrefs(),
        val prefsLoaded: Boolean = false,
        val instantPush: Boolean = false,
        val systemAllowed: Boolean = true,
        val testing: Boolean = false,
        val signingOut: Boolean = false,
    )

    val uiPrefs: StateFlow<UiPrefs> = prefs.uiPrefs.stateIn(viewModelScope, SharingStarted.Eagerly, UiPrefs())
    private val _state = MutableStateFlow(UiState(systemAllowed = notifier.canNotify()))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init {
        viewModelScope.launch {
            when (val r = alerts.device()) {
                is ApiResult.Success -> _state.update { it.copy(prefs = r.data.prefs, prefsLoaded = true, instantPush = r.data.pushConfigured && r.data.hasPushToken) }
                is ApiResult.Failure -> _state.update { it.copy(prefsLoaded = true) }
            }
        }
    }

    fun refreshPermission() {
        val allowed = notifier.canNotify()
        val was = _state.value.systemAllowed
        _state.update { it.copy(systemAllowed = allowed) }
        if (allowed && !was) viewModelScope.launch { runCatching { registrar.register() } }
    }

    fun setPrefs(next: AlertPrefs) {
        val before = _state.value.prefs
        _state.update { it.copy(prefs = next) }
        viewModelScope.launch {
            if (alerts.savePrefs(next) is ApiResult.Failure) {
                _state.update { it.copy(prefs = before) }
                _messages.send("Couldn't save. Check your connection and try again.")
            }
        }
    }

    fun sendTest() {
        _state.update { it.copy(testing = true) }
        viewModelScope.launch {
            when (val r = alerts.test()) {
                is ApiResult.Success -> _messages.send(
                    when {
                        r.data.sent > 0 -> "Test sent. It should arrive in a few seconds."
                        !r.data.pushConfigured -> "Test saved to your alerts. Without Firebase it shows within 15 minutes."
                        else -> "The test couldn't be delivered to this phone. Try signing out and in again."
                    },
                )
                is ApiResult.Failure -> _messages.send(r.error.message)
            }
            _state.update { it.copy(testing = false) }
        }
    }

    fun setTheme(mode: ThemeMode) = viewModelScope.launch { prefs.setTheme(mode) }
    fun setAppLock(on: Boolean) = viewModelScope.launch { prefs.setAppLock(on) }
    fun setSecureScreen(on: Boolean) = viewModelScope.launch { prefs.setSecureScreen(on) }

    fun rename(name: String) = viewModelScope.launch {
        when (val r = profile.rename(name)) {
            is ApiResult.Success -> { auth.refreshAccount(); _messages.send("Name saved") }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
    }

    fun signOut(everywhere: Boolean) {
        _state.update { it.copy(signingOut = true) }
        viewModelScope.launch {
            val r = auth.signOut(everywhere)
            if (r is ApiResult.Failure && everywhere) {
                _messages.send(r.error.message)
                _state.update { it.copy(signingOut = false) }
            }
        }
    }
}

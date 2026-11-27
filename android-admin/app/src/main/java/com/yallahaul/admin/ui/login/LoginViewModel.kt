package com.yallahaul.admin.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.AuthRepository
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.prefs.AppPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val auth: AuthRepository,
    prefs: AppPreferences,
) : ViewModel() {
    enum class Step { Credentials, Code }

    data class UiState(
        val step: Step = Step.Credentials,
        val email: String = "",
        val password: String = "",
        val code: String = "",
        val useBackup: Boolean = false,
        val loading: Boolean = false,
        val error: String? = null,
        val enrollRequired: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var ticket: String? = null

    init {
        viewModelScope.launch {
            val remembered = prefs.rememberedEmail.first()
            if (remembered.isNotBlank()) _state.update { if (it.email.isBlank()) it.copy(email = remembered) else it }
        }
    }

    fun setEmail(value: String) = _state.update { it.copy(email = value.take(254), error = null, enrollRequired = false) }
    fun setPassword(value: String) = _state.update { it.copy(password = value.take(128), error = null) }
    fun setCode(value: String) = _state.update { it.copy(code = value.take(20), error = null) }
    fun toggleBackup() = _state.update { it.copy(useBackup = !it.useBackup, code = "", error = null) }

    fun backToCredentials() {
        ticket = null
        _state.update { it.copy(step = Step.Credentials, code = "", error = null, useBackup = false) }
    }

    fun submitCredentials() {
        val s = _state.value
        if (s.loading || s.email.isBlank() || s.password.isEmpty()) return
        _state.update { it.copy(loading = true, error = null, enrollRequired = false) }
        viewModelScope.launch {
            when (val result = auth.login(s.email, s.password)) {
                is ApiResult.Success -> {
                    ticket = result.data.ticket
                    // The password is not kept once it has done its job.
                    _state.update { it.copy(loading = false, step = Step.Code, password = "", code = "") }
                }
                is ApiResult.Failure -> _state.update {
                    it.copy(loading = false, error = result.error.message, enrollRequired = result.error.code == "ENROLL_REQUIRED")
                }
            }
        }
    }

    fun submitCode() {
        val s = _state.value
        val t = ticket
        if (s.loading || t == null || s.code.length < 6) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val outcome = auth.verifyCode(t, s.code)) {
                is AuthRepository.CodeOutcome.Done -> _state.update { UiState(email = it.email) }
                is AuthRepository.CodeOutcome.Failed -> {
                    if (outcome.error.code == "RESTART") {
                        ticket = null
                        _state.update { it.copy(loading = false, step = Step.Credentials, code = "", error = outcome.error.message) }
                    } else {
                        _state.update { it.copy(loading = false, code = "", error = outcome.error.message) }
                    }
                }
            }
        }
    }
}

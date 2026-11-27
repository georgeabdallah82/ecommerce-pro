package com.yallahaul.admin.core.session

import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.StoreInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

enum class SignOutReason { Manual, Expired }

sealed interface SessionState {
    data object Loading : SessionState
    data class SignedOut(val reason: SignOutReason? = null) : SessionState
    data class SignedIn(val user: AppUser, val store: StoreInfo) : SessionState
}

@Serializable
private data class SavedAccount(val user: AppUser, val store: StoreInfo = StoreInfo())

/**
 * Who is signed in. The token is kept in memory for requests and encrypted on disk ([TokenVault]).
 * A staff sign-in lasts one shift (12 hours, the same as the website); when it ends, or the owner
 * signs the account out everywhere, the server answers 401 and the app returns to the sign-in screen.
 */
@Singleton
class SessionManager @Inject constructor(private val vault: TokenVault, private val json: Json) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    @Volatile private var token: String? = null
    @Volatile private var expiresAt: Instant? = null

    fun currentToken(): String? {
        val expiry = expiresAt
        if (expiry != null && Instant.now().isAfter(expiry)) { expire(); return null }
        return token
    }

    val signedInUser: AppUser? get() = (state.value as? SessionState.SignedIn)?.user

    suspend fun restore() {
        val stored = vault.read()
        val account = stored?.userJson?.let { runCatching { json.decodeFromString(SavedAccount.serializer(), it) }.getOrNull() }
        val expiry = stored?.expiresAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        if (stored == null || account == null || (expiry != null && Instant.now().isAfter(expiry))) {
            vault.clear()
            _state.value = SessionState.SignedOut(if (stored != null) SignOutReason.Expired else null)
            return
        }
        token = stored.token
        expiresAt = expiry
        _state.value = SessionState.SignedIn(account.user, account.store)
    }

    suspend fun signedIn(token: String, expiresAt: String?, user: AppUser, store: StoreInfo) {
        this.token = token
        this.expiresAt = expiresAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        vault.save(token, expiresAt, json.encodeToString(SavedAccount.serializer(), SavedAccount(user, store)))
        _state.value = SessionState.SignedIn(user, store)
    }

    suspend fun updateAccount(user: AppUser, store: StoreInfo) {
        if (token == null) return
        vault.updateUser(json.encodeToString(SavedAccount.serializer(), SavedAccount(user, store)))
        _state.value = SessionState.SignedIn(user, store)
    }

    suspend fun clear(reason: SignOutReason) {
        token = null
        expiresAt = null
        vault.clear()
        _state.value = SessionState.SignedOut(reason)
    }

    /** Called by the network layer when the server says the sign-in is no longer valid. */
    fun expire() {
        if (token == null && state.value is SessionState.SignedOut) return
        scope.launch { clear(SignOutReason.Expired) }
    }
}

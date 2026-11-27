package com.yallahaul.admin.core.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.SecureRandom
import android.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

enum class ThemeMode { System, Light, Dark }

data class UiPrefs(
    val theme: ThemeMode = ThemeMode.System,
    val appLock: Boolean = false,
    val secureScreen: Boolean = false,
)

internal val Context.appDataStore: DataStore<Preferences> by preferencesDataStore(name = "yallahaul_prefs")

/** Settings that only concern this phone. Nothing here is secret: the sign-in lives in [com.yallahaul.admin.core.session.TokenVault]. */
@Singleton
class AppPreferences @Inject constructor(@ApplicationContext private val context: Context) {
    private val store get() = context.appDataStore

    private object Keys {
        val theme = stringPreferencesKey("theme")
        val appLock = booleanPreferencesKey("app_lock")
        val secureScreen = booleanPreferencesKey("secure_screen")
        val installId = stringPreferencesKey("install_id")
        val rememberedEmail = stringPreferencesKey("remembered_email")
        val lastAlertSeen = stringPreferencesKey("last_alert_seen")
        val notificationsAsked = booleanPreferencesKey("notifications_asked")
    }

    val uiPrefs: Flow<UiPrefs> = store.data.map { p ->
        UiPrefs(
            theme = runCatching { ThemeMode.valueOf(p[Keys.theme] ?: ThemeMode.System.name) }.getOrDefault(ThemeMode.System),
            appLock = p[Keys.appLock] ?: false,
            secureScreen = p[Keys.secureScreen] ?: false,
        )
    }

    suspend fun setTheme(mode: ThemeMode) = store.edit { it[Keys.theme] = mode.name }
    suspend fun setAppLock(on: Boolean) = store.edit { it[Keys.appLock] = on }
    suspend fun setSecureScreen(on: Boolean) = store.edit { it[Keys.secureScreen] = on }

    val rememberedEmail: Flow<String> = store.data.map { it[Keys.rememberedEmail] ?: "" }
    suspend fun setRememberedEmail(email: String) = store.edit { it[Keys.rememberedEmail] = email }

    suspend fun lastAlertSeen(): String? = store.data.first()[Keys.lastAlertSeen]
    suspend fun setLastAlertSeen(iso: String) = store.edit { it[Keys.lastAlertSeen] = iso }

    suspend fun notificationsAsked(): Boolean = store.data.first()[Keys.notificationsAsked] ?: false
    suspend fun setNotificationsAsked() = store.edit { it[Keys.notificationsAsked] = true }

    /** A random id for this install (32 URL-safe characters): the server remembers the phone as one device by it. */
    suspend fun installId(): String {
        store.data.first()[Keys.installId]?.let { return it }
        val bytes = ByteArray(24).also { SecureRandom().nextBytes(it) }
        val id = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        store.edit { it[Keys.installId] = id }
        return id
    }

    suspend fun clearAccountData() = store.edit {
        it.remove(Keys.lastAlertSeen)
    }
}

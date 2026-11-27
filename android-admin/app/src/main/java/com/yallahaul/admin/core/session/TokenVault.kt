package com.yallahaul.admin.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.vaultStore: DataStore<Preferences> by preferencesDataStore(name = "yallahaul_vault")

/**
 * Keeps the sign-in token encrypted at rest with an AES-256-GCM key that lives in the Android
 * Keystore (hardware-backed on Samsung phones) and never leaves it. The file holds only ciphertext,
 * is excluded from backups (data_extraction_rules.xml), and is wiped on sign-out.
 */
interface TokenVault {
    data class Stored(val token: String, val expiresAt: String?, val userJson: String?)
    suspend fun save(token: String, expiresAt: String?, userJson: String)
    suspend fun updateUser(userJson: String)
    suspend fun read(): Stored?
    suspend fun clear()
}

@Singleton
class KeystoreTokenVault @Inject constructor(@ApplicationContext private val context: Context) : TokenVault {
    private val tokenKey = stringPreferencesKey("token")
    private val expiresKey = stringPreferencesKey("expires_at")
    private val userKey = stringPreferencesKey("user_json")

    override suspend fun save(token: String, expiresAt: String?, userJson: String) {
        val sealed = seal(token)
        context.vaultStore.edit {
            it[tokenKey] = sealed
            if (expiresAt != null) it[expiresKey] = expiresAt else it.remove(expiresKey)
            it[userKey] = userJson
        }
    }

    override suspend fun updateUser(userJson: String) { context.vaultStore.edit { it[userKey] = userJson } }

    override suspend fun read(): TokenVault.Stored? {
        val prefs = context.vaultStore.data.first()
        val sealed = prefs[tokenKey] ?: return null
        val token = runCatching { open(sealed) }.getOrNull() ?: run { clear(); return null }
        return TokenVault.Stored(token, prefs[expiresKey], prefs[userKey])
    }

    override suspend fun clear() { context.vaultStore.edit { it.clear() } }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return b64(cipher.iv) + "." + b64(sealed)
    }

    private fun open(stored: String): String {
        val (iv, sealed) = stored.split('.', limit = 2).let { it[0] to it[1] }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, unb64(iv))) }
        return String(cipher.doFinal(unb64(sealed)), Charsets.UTF_8)
    }

    private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun unb64(text: String) = Base64.decode(text, Base64.NO_WRAP)

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "yallahaul_admin_session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

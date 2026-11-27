package com.yallahaul.admin.core.cache

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyStore
import java.security.MessageDigest
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The last copy of each screen's data, so the app still shows something without internet.
 * Files are encrypted (AES-256-GCM, key in the Android Keystore), kept only on this phone (no
 * backups), and deleted when anyone signs out.
 */
interface ResponseCache {
    suspend fun <T> put(key: String, serializer: KSerializer<T>, value: T)
    suspend fun <T> get(key: String, serializer: KSerializer<T>): Pair<T, Instant>?
    suspend fun clear()
}

/** Runs [block]; saves a good answer under [key], and falls back to the saved copy when the store can't be reached. */
suspend fun <T> ResponseCache.cachedCall(key: String, serializer: KSerializer<T>, block: suspend () -> ApiResult<T>): ApiResult<T> {
    val result = block()
    return when (result) {
        is ApiResult.Success -> { runCatching { put(key, serializer, result.data) }; result }
        is ApiResult.Failure -> {
            val unreachable = result.error.kind in setOf(AppError.Kind.Offline, AppError.Kind.Timeout, AppError.Kind.Server)
            val saved = if (unreachable) runCatching { get(key, serializer) }.getOrNull() else null
            if (saved != null) ApiResult.Success(saved.first, cachedAt = saved.second) else result
        }
    }
}

@Singleton
class EncryptedResponseCache @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) : ResponseCache {
    private val dir get() = File(context.noBackupFilesDir, "screen-cache").apply { mkdirs() }

    private fun file(key: String): File {
        val name = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }.take(40)
        return File(dir, "$name.bin")
    }

    override suspend fun <T> put(key: String, serializer: KSerializer<T>, value: T) = withContext(Dispatchers.IO) {
        val plain = json.encodeToString(serializer, value).toByteArray(Charsets.UTF_8)
        if (plain.size > MAX_BYTES) return@withContext
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(plain)
        val out = ByteBuffer.allocate(8 + 1 + cipher.iv.size + sealed.size)
            .putLong(System.currentTimeMillis()).put(cipher.iv.size.toByte()).put(cipher.iv).put(sealed).array()
        val target = file(key)
        val temp = File(target.path + ".tmp")
        temp.writeBytes(out)
        temp.renameTo(target)
        Unit
    }

    override suspend fun <T> get(key: String, serializer: KSerializer<T>): Pair<T, Instant>? = withContext(Dispatchers.IO) {
        val target = file(key)
        if (!target.exists()) return@withContext null
        runCatching {
            val buffer = ByteBuffer.wrap(target.readBytes())
            val savedAt = Instant.ofEpochMilli(buffer.long)
            val iv = ByteArray(buffer.get().toInt()).also { buffer.get(it) }
            val sealed = ByteArray(buffer.remaining()).also { buffer.get(it) }
            val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
            json.decodeFromString(serializer, String(cipher.doFinal(sealed), Charsets.UTF_8)) to savedAt
        }.getOrElse { target.delete(); null }
    }

    override suspend fun clear() = withContext(Dispatchers.IO) { dir.listFiles()?.forEach { it.delete() }; Unit }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        }.generateKey()
    }

    private companion object {
        const val ALIAS = "yallahaul_admin_cache"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val MAX_BYTES = 2 * 1024 * 1024
    }
}

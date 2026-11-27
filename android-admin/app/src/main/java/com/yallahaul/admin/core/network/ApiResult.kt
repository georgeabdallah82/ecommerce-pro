package com.yallahaul.admin.core.network

import com.yallahaul.admin.core.model.ApiErrorBody
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** What went wrong with a request, in words a store owner understands. */
data class AppError(val kind: Kind, val message: String, val code: String? = null, val status: Int? = null) {
    enum class Kind { Offline, Timeout, Unauthorized, Forbidden, NotFound, Conflict, RateLimited, Validation, Server, Unknown }
    val isAuth get() = kind == Kind.Unauthorized
}

sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Failure(val error: AppError) : ApiResult<Nothing>
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data))
    is ApiResult.Failure -> this
}

fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

private val errorJson = Json { ignoreUnknownKeys = true; isLenient = true }

/** Runs one request and turns every failure into an [AppError]; never throws (except cancellation). */
suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    ApiResult.Failure(httpError(e.code(), e.response()?.errorBody()?.string()))
} catch (e: SocketTimeoutException) {
    ApiResult.Failure(AppError(AppError.Kind.Timeout, "The store took too long to answer. Try again."))
} catch (e: UnknownHostException) {
    ApiResult.Failure(AppError(AppError.Kind.Offline, "No internet connection. Check your connection and try again."))
} catch (e: IOException) {
    ApiResult.Failure(AppError(AppError.Kind.Offline, "Couldn't reach the store. Check your connection and try again."))
} catch (e: kotlinx.serialization.SerializationException) {
    ApiResult.Failure(AppError(AppError.Kind.Unknown, "The store answered in a way this app doesn't understand. Update the app."))
} catch (e: IllegalArgumentException) {
    ApiResult.Failure(AppError(AppError.Kind.Unknown, "Something went wrong. Try again."))
}

fun httpError(status: Int, body: String?): AppError {
    val parsed = body?.takeIf { it.isNotBlank() }?.let { runCatching { errorJson.decodeFromString(ApiErrorBody.serializer(), it) }.getOrNull() }
    val serverMessage = parsed?.error?.takeIf { it.isNotBlank() && it.length < 400 }
    val kind = when (status) {
        401 -> AppError.Kind.Unauthorized
        403 -> AppError.Kind.Forbidden
        404 -> AppError.Kind.NotFound
        409 -> AppError.Kind.Conflict
        429 -> AppError.Kind.RateLimited
        400, 422 -> AppError.Kind.Validation
        in 500..599 -> AppError.Kind.Server
        else -> AppError.Kind.Unknown
    }
    val fallback = when (kind) {
        AppError.Kind.Unauthorized -> "Your session has ended. Please sign in again."
        AppError.Kind.Forbidden -> "Your account isn't allowed to do that."
        AppError.Kind.NotFound -> "That item no longer exists."
        AppError.Kind.Conflict -> "This was just changed by someone else. Refresh and try again."
        AppError.Kind.RateLimited -> "Too many attempts. Please wait a few minutes."
        AppError.Kind.Server -> "The store had a problem. Try again in a moment."
        else -> "Something went wrong. Try again."
    }
    return AppError(kind, serverMessage ?: fallback, parsed?.code, status)
}

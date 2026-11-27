package com.yallahaul.admin.core.network

import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.session.SessionManager
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Adds the sign-in token -- but only to requests for the store's own address, so it is never sent
 * to an image host or any other server. A 401 on a signed request ends the session.
 */
@Singleton
class AuthInterceptor @Inject constructor(private val session: SessionManager) : Interceptor {
    private val apiHost = BuildConfig.API_BASE_URL.toHttpUrl()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val ownServer = request.url.host == apiHost.host && request.url.scheme == apiHost.scheme && request.url.port == apiHost.port
        val builder = request.newBuilder()
            .header("User-Agent", "YallaHaulAdmin/${BuildConfig.VERSION_NAME} (Android ${android.os.Build.VERSION.RELEASE})")
        val token = if (ownServer) session.currentToken() else null
        if (token != null) builder.header("Authorization", "Bearer $token")
        if (ownServer) builder.header("Accept", "application/json")
        val response = chain.proceed(builder.build())
        val isSignIn = request.url.encodedPath.startsWith("/api/mobile/v1/auth/login") || request.url.encodedPath.startsWith("/api/mobile/v1/auth/code")
        if (token != null && response.code == 401 && !isSignIn) session.expire()
        return response
    }
}

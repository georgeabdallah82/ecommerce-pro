package com.yallahaul.admin

import com.yallahaul.admin.core.network.AuthInterceptor
import com.yallahaul.admin.core.session.SessionManager

import com.yallahaul.admin.core.di.AppModule
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner


/** The sign-in token must never reach a server other than the store (image hosts, links...). */
@RunWith(RobolectricTestRunner::class)
class AuthInterceptorTest {
    @Test fun tokenIsNotSentToOtherHosts() {
        val session = SessionManager(FakeVault(), AppModule.json())
        val field = SessionManager::class.java.getDeclaredField("token").apply { isAccessible = true }
        field.set(session, "secret-token-value-123456789")
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("ok")); start() }
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(session)).build()
        client.newCall(Request.Builder().url(server.url("/api/admin/orders")).build()).execute().close()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }
}

class FakeVault : com.yallahaul.admin.core.session.TokenVault {
    private var stored: com.yallahaul.admin.core.session.TokenVault.Stored? = null
    override suspend fun save(token: String, expiresAt: String?, userJson: String) { stored = com.yallahaul.admin.core.session.TokenVault.Stored(token, expiresAt, userJson) }
    override suspend fun updateUser(userJson: String) { stored = stored?.copy(userJson = userJson) }
    override suspend fun read() = stored
    override suspend fun clear() { stored = null }
}

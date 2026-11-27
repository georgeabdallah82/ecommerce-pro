package com.yallahaul.admin.screens

import com.yallahaul.admin.FakeVault
import com.yallahaul.admin.core.di.AppModule
import com.yallahaul.admin.core.di.StorageModule
import com.yallahaul.admin.core.network.ApiService
import com.yallahaul.admin.core.network.AuthInterceptor
import com.yallahaul.admin.core.session.TokenVault
import dagger.Module
import dagger.Provides
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Singleton

/** A stand-in store that answers with responses recorded from the real backend. */
object FakeStore {
    var dashboardFixture = "demo-dashboard"
    val server: MockWebServer by lazy {
        MockWebServer().apply {
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val path = request.requestUrl!!.encodedPath
                    val name = when {
                        path == "/api/mobile/v1/me" -> "me"
                        path == "/api/mobile/v1/dashboard" -> dashboardFixture
                        path == "/api/admin/orders" && request.method == "GET" -> "orders"
                        path.startsWith("/api/mobile/v1/orders/") -> "order"
                        path == "/api/admin/products" -> "products"
                        path.startsWith("/api/admin/products/") -> "product"
                        path == "/api/admin/collections" -> "collections"
                        path == "/api/mobile/v1/inventory" -> "inventory"
                        path == "/api/admin/customers" -> "customers"
                        path.startsWith("/api/admin/customers/") -> "customer"
                        path == "/api/admin/coupons" && request.method == "GET" -> "coupons"
                        path == "/api/mobile/v1/notifications" && request.method == "GET" -> "alerts"
                        path == "/api/mobile/v1/devices" -> "device"
                        else -> null
                    }
                    val body = name?.let { javaClass.classLoader!!.getResource("fixtures/$it.json")!!.readText() } ?: "{\"ok\":true}"
                    return MockResponse().setHeader("content-type", "application/json").setBody(body)
                }
            }
            start()
        }
    }
}

@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [AppModule::class])
object TestNetworkModule {
    @Provides @Singleton fun json(): Json = AppModule.json()
    @Provides @Singleton fun okHttp(auth: AuthInterceptor): OkHttpClient = OkHttpClient.Builder().addInterceptor(auth).build()
    @Provides @Singleton fun api(client: OkHttpClient, json: Json): ApiService = Retrofit.Builder()
        .baseUrl(FakeStore.server.url("/"))
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build().create(ApiService::class.java)
}

@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [StorageModule::class])
object TestStorageModule {
    @Provides @Singleton fun vault(): TokenVault = FakeVault()
}

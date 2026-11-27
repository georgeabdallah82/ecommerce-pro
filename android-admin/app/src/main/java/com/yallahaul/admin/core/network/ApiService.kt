package com.yallahaul.admin.core.network

import com.yallahaul.admin.core.model.*
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The Yalla Haul backend, as the app uses it. App-only endpoints live under /api/mobile/v1; every
 * change goes through the same /api/admin endpoints the web admin uses, so stock, refunds, emails,
 * WhatsApp messages, webhooks and the activity log behave exactly as they do on the website.
 */
interface ApiService {
    // Sign-in (app/api/mobile/v1/auth)
    @POST("api/mobile/v1/auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @POST("api/mobile/v1/auth/code") suspend fun verifyCode(@Body body: CodeRequest): CodeResponse
    @POST("api/mobile/v1/auth/logout") suspend fun logout(@Body body: LogoutRequest): OkResponse
    @GET("api/mobile/v1/me") suspend fun me(): MeResponse

    // Dashboard
    @GET("api/mobile/v1/dashboard") suspend fun dashboard(@Query("range") range: Int): DashboardResponse

    // Orders
    @GET("api/admin/orders") suspend fun orders(
        @Query("status") status: String?,
        @Query("q") query: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int = 30,
        @Query("counts") counts: Int = 1,
    ): OrdersPage
    @GET("api/mobile/v1/orders/{id}") suspend fun order(@Path("id") id: String): OrderDetailResponse
    @PATCH("api/admin/orders") suspend fun updateOrder(@Body body: OrderPatch): OrderPatchResponse

    // Products
    @GET("api/admin/products") suspend fun products(
        @Query("q") query: String?,
        @Query("status") status: String,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int = 24,
        @Query("sort") sort: String = "updated_desc",
    ): ProductsPage
    @GET("api/admin/products/{id}") suspend fun product(@Path("id") id: String): ProductDetailResponse
    @POST("api/admin/products") suspend fun createProduct(@Body body: JsonObject): ProductSaveResponse
    @PATCH("api/admin/products/{id}") suspend fun updateProduct(@Path("id") id: String, @Body body: JsonObject): JsonObject
    @GET("api/admin/collections") suspend fun collections(@Query("take") take: Int = 200): CollectionsPage
    @Multipart @POST("api/admin/media/upload") suspend fun uploadImage(
        @Part file: MultipartBody.Part,
        @Part("alt") alt: RequestBody,
    ): MediaUploadResponse

    // Inventory
    @GET("api/mobile/v1/inventory") suspend fun inventory(
        @Query("q") query: String?,
        @Query("filter") filter: String,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int = 30,
    ): InventoryPage
    @PATCH("api/admin/inventory") suspend fun adjustInventory(@Body body: InventoryAdjust): JsonObject

    // Customers
    @GET("api/admin/customers") suspend fun customers(
        @Query("q") query: String?,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int = 25,
    ): CustomersPage
    @GET("api/admin/customers/{id}") suspend fun customer(@Path("id") id: String): CustomerDetailResponse

    // Discounts
    @GET("api/admin/coupons") suspend fun coupons(): List<Coupon>
    @POST("api/admin/coupons") suspend fun createCoupon(@Body body: JsonObject): CouponResponse
    @PATCH("api/admin/coupons") suspend fun updateCoupon(@Body body: JsonObject): CouponResponse
    @DELETE("api/admin/coupons") suspend fun deleteCoupon(@Query("id") id: String): OkResponse

    // Alerts and this phone
    @GET("api/mobile/v1/notifications") suspend fun alerts(@Query("since") since: String? = null, @Query("limit") limit: Int = 50): AlertsResponse
    @POST("api/mobile/v1/notifications") suspend fun markAlerts(@Body body: AlertsMark): OkResponse
    @GET("api/mobile/v1/devices") suspend fun device(@Header("X-Install-Id") installId: String): DeviceState
    @PUT("api/mobile/v1/devices") suspend fun registerDevice(@Body body: DeviceRegistration): DeviceState
    @POST("api/mobile/v1/devices") suspend fun testAlert(@Body body: TestAlertRequest = TestAlertRequest()): TestAlertResponse
    @HTTP(method = "DELETE", path = "api/mobile/v1/devices") suspend fun unregisterDevice(@Header("X-Install-Id") installId: String): OkResponse

    // My profile
    @GET("api/admin/profile") suspend fun profile(): ProfileResponse
    @PATCH("api/admin/profile") suspend fun updateName(@Body body: NameUpdate): ProfileResponse
}

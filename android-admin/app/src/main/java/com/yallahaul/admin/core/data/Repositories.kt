package com.yallahaul.admin.core.data

import android.content.Context
import android.net.Uri
import android.os.Build
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.model.*
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.ApiService
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.core.network.apiCall
import com.yallahaul.admin.core.prefs.AppPreferences
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SignOutReason
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val session: SessionManager,
    private val prefs: AppPreferences,
) {
    sealed interface CodeOutcome {
        data class Done(val backupLeft: Int?) : CodeOutcome
        data class Failed(val error: AppError) : CodeOutcome
    }

    suspend fun login(email: String, password: String): ApiResult<LoginResponse> =
        apiCall { api.login(LoginRequest(email.trim().lowercase(), password)) }

    suspend fun verifyCode(ticket: String, code: String): CodeOutcome {
        val installId = prefs.installId()
        return when (val result = apiCall { api.verifyCode(CodeRequest(ticket, code.trim(), installId)) }) {
            is ApiResult.Failure -> CodeOutcome.Failed(result.error)
            is ApiResult.Success -> {
                val data = result.data
                session.signedIn(data.token, data.expiresAt, data.user, com.yallahaul.admin.core.model.StoreInfo())
                prefs.setRememberedEmail(data.user.email)
                refreshAccount()
                CodeOutcome.Done(data.backupLeft)
            }
        }
    }

    /** Reloads who is signed in, their permissions and the store's basics. */
    suspend fun refreshAccount(): ApiResult<MeResponse> {
        val result = apiCall { api.me() }
        if (result is ApiResult.Success) session.updateAccount(result.data.user, result.data.store)
        return result
    }

    suspend fun signOut(everywhere: Boolean = false): ApiResult<OkResponse> {
        val result = apiCall { api.logout(LogoutRequest(prefs.installId(), everywhere)) }
        if (everywhere && result is ApiResult.Failure) return result
        prefs.clearAccountData()
        session.clear(SignOutReason.Manual)
        return result
    }
}

@Singleton
class DashboardRepository @Inject constructor(private val api: ApiService) {
    suspend fun load(range: Int) = apiCall { api.dashboard(range) }
}

@Singleton
class OrdersRepository @Inject constructor(private val api: ApiService) {
    suspend fun list(status: String?, query: String?, page: Int) = apiCall { api.orders(status, query?.takeIf { it.isNotBlank() }, page) }
    suspend fun detail(id: String) = apiCall { api.order(id) }
    suspend fun setStatus(id: String, status: String, tracking: Tracking? = null) = apiCall {
        api.updateOrder(OrderPatch(id = id, status = status, trackingNumber = tracking?.number, trackingCompany = tracking?.company, trackingUrl = tracking?.url))
    }
    suspend fun markPaid(id: String) = apiCall { api.updateOrder(OrderPatch(id = id, paymentStatus = "PAID")) }
    suspend fun addNote(id: String, note: String) = apiCall { api.updateOrder(OrderPatch(id = id, addNote = note)) }
    suspend fun updateTracking(id: String, number: String) = apiCall { api.updateOrder(OrderPatch(id = id, trackingNumber = number)) }

    data class Tracking(val number: String?, val company: String?, val url: String?)
}

@Singleton
class ProductsRepository @Inject constructor(
    private val api: ApiService,
    @ApplicationContext private val context: Context,
) {
    suspend fun list(status: String, query: String?, page: Int) = apiCall { api.products(query?.takeIf { it.isNotBlank() }, status, page) }
    suspend fun detail(id: String) = apiCall { api.product(id) }
    suspend fun collections() = apiCall { api.collections() }
    suspend fun create(draft: ProductDraft) = apiCall { api.createProduct(ProductPayloads.create(draft)) }
    suspend fun update(id: String, draft: ProductDraft, original: ProductDetail) = apiCall { api.updateProduct(id, ProductPayloads.update(draft, original)) }
    suspend fun setStatus(id: String, status: String) = apiCall { api.updateProduct(id, ProductPayloads.status(status)) }

    /** Uploads a photo from the gallery to the store's media library (the same as the web editor) and returns its address. */
    suspend fun uploadImage(uri: Uri, alt: String): ApiResult<MediaAsset> {
        val bytes = withContext(Dispatchers.IO) {
            runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        } ?: return ApiResult.Failure(AppError(AppError.Kind.Validation, "That photo couldn't be read."))
        if (bytes.size > 5 * 1024 * 1024) return ApiResult.Failure(AppError(AppError.Kind.Validation, "Photos can be 5 MB at most. Choose a smaller one."))
        val type = context.contentResolver.getType(uri) ?: "image/jpeg"
        val name = "product-${System.currentTimeMillis()}.${type.substringAfter('/').substringBefore(';').ifBlank { "jpg" }}"
        val part = MultipartBody.Part.createFormData("file", name, bytes.toRequestBody(type.toMediaType()))
        return apiCall { api.uploadImage(part, alt.ifBlank { name }.toRequestBody("text/plain".toMediaType())).asset }
    }
}

@Singleton
class InventoryRepository @Inject constructor(private val api: ApiService) {
    suspend fun list(filter: String, query: String?, page: Int) = apiCall { api.inventory(query?.takeIf { it.isNotBlank() }, filter, page) }
    suspend fun adjust(id: String, delta: Int, reason: String, damage: Boolean, threshold: Int?) = apiCall {
        api.adjustInventory(InventoryAdjust(id = id, delta = delta, reason = reason, movementType = if (damage) "DAMAGE" else "ADJUSTMENT", lowStockThreshold = threshold))
    }
}

@Singleton
class CustomersRepository @Inject constructor(private val api: ApiService) {
    suspend fun list(query: String?, page: Int) = apiCall { api.customers(query?.takeIf { it.isNotBlank() }, page) }
    suspend fun detail(id: String) = apiCall { api.customer(id) }
}

@Singleton
class DiscountsRepository @Inject constructor(private val api: ApiService) {
    suspend fun list() = apiCall { api.coupons() }
    suspend fun create(draft: CouponDraft) = apiCall { api.createCoupon(CouponPayloads.create(draft)) }
    suspend fun update(original: Coupon, draft: CouponDraft) = apiCall { api.updateCoupon(CouponPayloads.update(original, draft)) }
    suspend fun setActive(id: String, active: Boolean) = apiCall { api.updateCoupon(CouponPayloads.toggle(id, active)) }
    suspend fun delete(id: String) = apiCall { api.deleteCoupon(id) }
}

@Singleton
class AlertsRepository @Inject constructor(private val api: ApiService, private val prefs: AppPreferences) {
    suspend fun list() = apiCall { api.alerts() }
    suspend fun since(iso: String?) = apiCall { api.alerts(since = iso, limit = 20) }
    suspend fun markRead(ids: List<String>) = apiCall { api.markAlerts(AlertsMark(ids = ids)) }
    suspend fun markAllRead() = apiCall { api.markAlerts(AlertsMark(all = true)) }
    suspend fun clearAll() = apiCall { api.markAlerts(AlertsMark(clear = true)) }
    suspend fun device() = apiCall { api.device(prefs.installId()) }
    suspend fun register(fcmToken: String?, alertPrefs: AlertPrefs? = null) = apiCall {
        api.registerDevice(DeviceRegistration(prefs.installId(), fcmToken, alertPrefs, BuildConfig.VERSION_NAME, "${Build.MANUFACTURER} ${Build.MODEL}".take(80)))
    }
    suspend fun savePrefs(alertPrefs: AlertPrefs) = apiCall { api.registerDevice(DeviceRegistration(prefs.installId(), prefs = alertPrefs)) }
    suspend fun test() = apiCall { api.testAlert() }
}

@Singleton
class ProfileRepository @Inject constructor(private val api: ApiService) {
    suspend fun load() = apiCall { api.profile() }
    suspend fun rename(name: String) = apiCall { api.updateName(NameUpdate(name.trim())) }
}

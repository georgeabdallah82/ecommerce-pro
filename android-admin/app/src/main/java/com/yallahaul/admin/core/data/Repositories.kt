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
import com.yallahaul.admin.core.cache.ResponseCache
import com.yallahaul.admin.core.cache.cachedCall
import kotlinx.serialization.builtins.ListSerializer
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
    private val cache: ResponseCache,
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
        cache.clear()
        session.clear(SignOutReason.Manual)
        return result
    }
}

@Singleton
class DashboardRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun load(range: Int) = cache.cachedCall("dashboard:$range", DashboardResponse.serializer()) { apiCall { api.dashboard(range) } }
}

@Singleton
class OrdersRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun list(status: String?, query: String?, page: Int): ApiResult<OrdersPage> {
        val call = suspend { apiCall { api.orders(status, query?.takeIf { it.isNotBlank() }, page) } }
        return if (page == 1 && query.isNullOrBlank()) cache.cachedCall("orders:${status ?: "all"}", OrdersPage.serializer(), call) else call()
    }
    suspend fun detail(id: String) = cache.cachedCall("order:$id", OrderDetailResponse.serializer()) { apiCall { api.order(id) } }
    suspend fun createManual(body: kotlinx.serialization.json.JsonObject) = apiCall { api.createManualOrder(body) }
    suspend fun recordWhatsapp(id: String, outcome: String, detail: String?) = apiCall { api.recordWhatsapp(WhatsappOutcomeRequest(id, outcome, detail?.takeIf { it.isNotBlank() })) }
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
    private val cache: ResponseCache,
) {
    suspend fun list(status: String, query: String?, page: Int): ApiResult<ProductsPage> {
        val call = suspend { apiCall { api.products(query?.takeIf { it.isNotBlank() }, status, page) } }
        return if (page == 1 && query.isNullOrBlank()) cache.cachedCall("products:$status", ProductsPage.serializer(), call) else call()
    }
    suspend fun detail(id: String) = apiCall { api.product(id) }
    suspend fun variants(id: String) = apiCall { api.productVariants(id).product.variants }
    suspend fun bulk(ids: List<String>, action: String) = apiCall { api.bulkProducts(BulkProducts(ids = ids, bulkAction = action)) }
    suspend fun saveVariants(id: String, variants: List<VariantDraft>) = apiCall { api.updateProduct(id, ProductPayloads.variants(variants)) }
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
class InventoryRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun list(filter: String, query: String?, page: Int): ApiResult<InventoryPage> {
        val call = suspend { apiCall { api.inventory(query?.takeIf { it.isNotBlank() }, filter, page) } }
        return if (page == 1 && query.isNullOrBlank()) cache.cachedCall("inventory:$filter", InventoryPage.serializer(), call) else call()
    }
    suspend fun lookup(code: String) = apiCall { api.lookup(code.trim()) }
    suspend fun adjust(id: String, delta: Int, reason: String, damage: Boolean, threshold: Int?) = apiCall {
        api.adjustInventory(InventoryAdjust(id = id, delta = delta, reason = reason, movementType = if (damage) "DAMAGE" else "ADJUSTMENT", lowStockThreshold = threshold))
    }
}

@Singleton
class CustomersRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun list(query: String?, page: Int): ApiResult<CustomersPage> {
        val call = suspend { apiCall { api.customers(query?.takeIf { it.isNotBlank() }, page) } }
        return if (page == 1 && query.isNullOrBlank()) cache.cachedCall("customers", CustomersPage.serializer(), call) else call()
    }
    suspend fun detail(id: String) = cache.cachedCall("customer:$id", CustomerDetailResponse.serializer()) { apiCall { api.customer(id) } }
}

@Singleton
class DiscountsRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun list() = cache.cachedCall("coupons", ListSerializer(Coupon.serializer())) { apiCall { api.coupons() } }
    suspend fun create(draft: CouponDraft) = apiCall { api.createCoupon(CouponPayloads.create(draft)) }
    suspend fun update(original: Coupon, draft: CouponDraft) = apiCall { api.updateCoupon(CouponPayloads.update(original, draft)) }
    suspend fun setActive(id: String, active: Boolean) = apiCall { api.updateCoupon(CouponPayloads.toggle(id, active)) }
    suspend fun delete(id: String) = apiCall { api.deleteCoupon(id) }
}

@Singleton
class AlertsRepository @Inject constructor(private val api: ApiService, private val prefs: AppPreferences, private val cache: ResponseCache) {
    suspend fun list() = cache.cachedCall("alerts", AlertsResponse.serializer()) { apiCall { api.alerts() } }
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


@Singleton
class DriversRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun list() = cache.cachedCall("drivers", DriversResponse.serializer()) { apiCall { api.drivers() } }
    suspend fun assign(orderIds: List<String>, driverId: String?) = apiCall { api.assignDriver(AssignDriverRequest(orderIds, driverId)) }
    suspend fun settle(driverId: String, orderIds: List<String>) = apiCall { api.settleDriver(SettleRequest(driverId, orderIds)) }
    suspend fun add(name: String, phone: String) = apiCall { api.addDriver(DriverSave(name = name.trim(), phone = phone.trim().ifBlank { null })) }
    suspend fun setActive(id: String, active: Boolean) = apiCall { api.updateDriver(DriverSave(id = id, active = active)) }
}

@Singleton
class ChatRepository @Inject constructor(private val api: ApiService) {
    suspend fun liveInbox() = apiCall { api.liveInbox() }
    suspend fun liveThread(id: String) = apiCall { api.liveThread(id).thread }
    suspend fun setOnline(online: Boolean) = apiCall { api.livePresence(LiveChatAction(action = "presence", online = online)).presence }
    suspend fun liveReply(id: String, text: String) = apiCall { api.liveReply(LiveChatAction(action = "reply", conversationId = id, text = text.trim())) }
    suspend fun teamHome() = apiCall { api.teamHome() }
    suspend fun teamMessages(channelId: String) = apiCall { api.teamMessages(channelId).messages }
    suspend fun teamSend(channelId: String, text: String) = apiCall { api.teamAction(TeamAction(action = "send", channelId = channelId, text = text.trim())) }
    suspend fun teamDirect(userId: String) = apiCall { api.teamAction(TeamAction(action = "dm", userId = userId)) }
    suspend fun teamDelete(messageId: String) = apiCall { api.teamAction(TeamAction(action = "delete", messageId = messageId)) }
}

@Singleton
class ReviewsRepository @Inject constructor(private val api: ApiService) {
    suspend fun reviews(all: Boolean) = apiCall { api.reviews(if (all) "all" else "waiting") }
    suspend fun setApproved(id: String, approved: Boolean) = apiCall { api.updateReview(ReviewPatch(id = id, approved = approved)) }
    suspend fun setFeatured(id: String, featured: Boolean) = apiCall { api.updateReview(ReviewPatch(id = id, featured = featured)) }
    suspend fun questions(all: Boolean) = apiCall { api.questions(if (all) "all" else "open") }
    suspend fun answer(id: String, answer: String, publish: Boolean) = apiCall { api.updateQuestion(QuestionPatch(id = id, answer = answer.trim(), published = publish)) }
    suspend fun setPublished(id: String, published: Boolean) = apiCall { api.updateQuestion(QuestionPatch(id = id, published = published)) }
    suspend fun deleteQuestion(id: String) = apiCall { api.deleteQuestion(id) }
}

/**
 * Returns and refunds. A refund needs the person to confirm it is them first (password or 2-step
 * code, the web's rule): the confirmation lasts 10 minutes and is kept in memory only.
 */
@Singleton
class ReturnsRepository @Inject constructor(private val api: ApiService) {
    @Volatile private var reauthToken: String? = null
    @Volatile private var reauthUntil: Long = 0

    val hasRecentConfirmation get() = reauthToken != null && System.currentTimeMillis() < reauthUntil

    suspend fun list(status: String?) = apiCall { api.returns(status) }
    suspend fun create(body: ReturnCreate) = apiCall { api.createReturn(body) }
    suspend fun act(id: String, action: String) = apiCall { api.returnAction(id, ReturnAction(action)) }

    suspend fun confirm(password: String?, code: String?): ApiResult<ReauthResponse> {
        val result = apiCall { api.reauth(ReauthRequest(password = password?.takeIf { it.isNotEmpty() }, code = code?.trim()?.takeIf { it.isNotEmpty() })) }
        if (result is ApiResult.Success && result.data.token != null) {
            reauthToken = result.data.token
            reauthUntil = System.currentTimeMillis() + (result.data.seconds - 20).coerceAtLeast(30) * 1000L
        }
        return result
    }

    suspend fun refund(orderId: String, amount: Long, reason: String): ApiResult<kotlinx.serialization.json.JsonObject> {
        val token = reauthToken?.takeIf { hasRecentConfirmation }
        return apiCall { api.refund(token, RefundRequest(orderId, amount, reason.trim())) }
    }
}

@Singleton
class UnfinishedRepository @Inject constructor(private val api: ApiService) {
    suspend fun list() = apiCall { api.unfinished() }
    suspend fun whatsappOpened(id: String) = apiCall { api.unfinishedAction(UnfinishedAction(id, "whatsapp")) }
    suspend fun dismiss(id: String) = apiCall { api.unfinishedAction(UnfinishedAction(id, "dismiss")) }
}

@Singleton
class ReportsRepository @Inject constructor(private val api: ApiService, private val cache: ResponseCache) {
    suspend fun sales(days: Int) = cache.cachedCall("report:sales:$days", SalesReport.serializer()) { apiCall { api.salesReport(days) } }
    suspend fun profit(days: Int) = cache.cachedCall("report:profit:$days", ProfitResponse.serializer()) { apiCall { api.profitReport(days) } }
}

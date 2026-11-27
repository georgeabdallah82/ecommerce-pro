package com.yallahaul.admin.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The shapes the Yalla Haul backend answers with. Money is always in minor units (cents), as the
// store keeps it. Every field has a default so a field the server adds or leaves out never breaks
// the app.

@Serializable
data class ApiErrorBody(val error: String? = null, val code: String? = null)

// ---------- Sign-in ----------

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class LoginResponse(val needsCode: Boolean = false, val ticket: String? = null)

@Serializable
data class CodeRequest(val ticket: String, val code: String, val installId: String)

@Serializable
data class CodeResponse(
    val token: String,
    val expiresAt: String? = null,
    val backupLeft: Int? = null,
    val user: AppUser,
)

@Serializable
data class LogoutRequest(val installId: String? = null, val everywhere: Boolean = false)

@Serializable
data class AppUser(
    val id: String,
    val name: String = "",
    val email: String = "",
    val phone: String? = null,
    val role: String = "",
    val avatarUrl: String? = null,
    val twoStepOn: Boolean = true,
    val lastLoginAt: String? = null,
    val permissions: List<String> = emptyList(),
) {
    fun can(permission: String) = permission in permissions
}

@Serializable
data class StoreInfo(
    val name: String = "Yalla Haul",
    val country: String = "",
    val currency: String = "USD",
    val timezone: String = "Asia/Beirut",
    val siteUrl: String = "",
)

@Serializable
data class MeResponse(val user: AppUser, val store: StoreInfo = StoreInfo(), val pushConfigured: Boolean = false)

@Serializable
data class ProfileResponse(val name: String = "", val email: String = "", val avatarUrl: String? = null)

@Serializable
data class NameUpdate(val name: String)

// ---------- Dashboard ----------

@Serializable
data class DashboardResponse(
    val currency: String = "USD",
    val timezone: String = "",
    val range: Int = 30,
    val generatedAt: String? = null,
    val revenue: Revenue = Revenue(),
    val orders: OrderStats = OrderStats(),
    val daily: List<DayPoint> = emptyList(),
    val bestSellers: List<BestSeller> = emptyList(),
    val recentOrders: List<OrderSummary> = emptyList(),
    val lowStock: LowStockBlock = LowStockBlock(),
    val attention: Attention = Attention(),
)

@Serializable
data class Revenue(
    val total: Long = 0,
    val today: Long = 0,
    val yesterday: Long = 0,
    val range: Long = 0,
    val previousRange: Long = 0,
    val averageOrder: Long = 0,
)

@Serializable
data class OrderStats(
    val total: Int = 0,
    val today: Int = 0,
    val range: Int = 0,
    val previousRange: Int = 0,
    val pending: Int = 0,
    val processing: Int = 0,
    val shipped: Int = 0,
    val completed: Int = 0,
    val cancelled: Int = 0,
    val refunded: Int = 0,
    val byStatus: Map<String, Int> = emptyMap(),
)

@Serializable
data class DayPoint(val day: String, val orders: Int = 0, val net: Long = 0)

@Serializable
data class BestSeller(
    val productId: String,
    val name: String = "",
    val sku: String = "",
    val imageUrl: String? = null,
    val sold: Int = 0,
    val revenue: Long = 0,
)

@Serializable
data class OrderSummary(
    val id: String,
    val orderNumber: String = "",
    val customer: String = "",
    val status: String = "PENDING",
    val paymentStatus: String = "UNPAID",
    val paymentMethod: String = "COD",
    val grandTotal: Long = 0,
    val currency: String = "USD",
    val itemCount: Int = 0,
    val createdAt: String = "",
)

@Serializable
data class LowStockBlock(val count: Int = 0, val outOfStock: Int = 0, val items: List<LowStockItem> = emptyList())

@Serializable
data class LowStockItem(
    val inventoryId: String,
    val productId: String = "",
    val name: String = "",
    val variant: String? = null,
    val available: Int = 0,
    val threshold: Int = 0,
    val imageUrl: String? = null,
)

@Serializable
data class Attention(val pendingReviews: Int = 0, val paymentProofsWaiting: Int = 0)

// ---------- Orders ----------

@Serializable
data class OrdersPage(
    val rows: List<OrderRow> = emptyList(),
    val pagination: Pagination = Pagination(),
    val counts: Map<String, Int>? = null,
)

@Serializable
data class Pagination(val page: Int = 1, val limit: Int = 50, val total: Int = 0, val pages: Int = 1)

@Serializable
data class UserRef(val id: String? = null, val name: String? = null, val email: String? = null, val phone: String? = null)

@Serializable
data class OrderRow(
    val id: String,
    val orderNumber: String = "",
    val email: String? = null,
    val phone: String? = null,
    val grandTotal: Long = 0,
    val currency: String = "USD",
    val status: String = "PENDING",
    val paymentStatus: String = "UNPAID",
    val paymentMethod: String = "COD",
    val fulfillmentStatus: String = "UNFULFILLED",
    val createdAt: String = "",
    val shippingAddressJson: String? = null,
    val user: UserRef? = null,
    val items: List<OrderRowItem> = emptyList(),
    val risk: OrderRisk? = null,
)

@Serializable
data class OrderRowItem(val id: String = "", val name: String = "", val quantity: Int = 0)

@Serializable
data class OrderRisk(val level: String = "medium", val headline: String = "", val reasons: List<String> = emptyList())

@Serializable
data class OrderDetailResponse(val order: OrderDetail, val actions: OrderActions = OrderActions(), val whatsapp: WhatsappInfo = WhatsappInfo())

@Serializable
data class OrderActions(
    val canManage: Boolean = false,
    val canRefund: Boolean = false,
    val nextStatuses: List<String> = emptyList(),
    val canMarkPaid: Boolean = false,
    val canReturn: Boolean = false,
    val refundable: Long = 0,
    val refundPending: Boolean = false,
    val canAssignDriver: Boolean = false,
)

@Serializable
data class OrderDetail(
    val id: String,
    val orderNumber: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
    val status: String = "PENDING",
    val paymentStatus: String = "UNPAID",
    val fulfillmentStatus: String = "UNFULFILLED",
    val paymentMethod: String = "COD",
    val currency: String = "USD",
    val subtotal: Long = 0,
    val discountTotal: Long = 0,
    val shippingTotal: Long = 0,
    val taxTotal: Long = 0,
    val grandTotal: Long = 0,
    val couponCode: String? = null,
    val notes: String? = null,
    val isGift: Boolean = false,
    val giftMessage: String? = null,
    val trackingNumber: String? = null,
    val shippingMethod: String? = null,
    val whatsappUpdates: Boolean = false,
    val customer: OrderCustomer = OrderCustomer(),
    val shippingAddress: Map<String, String> = emptyMap(),
    val billingAddress: Map<String, String>? = null,
    val driver: DriverRef? = null,
    val items: List<OrderDetailItem> = emptyList(),
    val events: List<OrderEvent> = emptyList(),
    val staffNotes: List<StaffNote> = emptyList(),
    val payments: List<PaymentTx> = emptyList(),
    val paymentProofs: List<PaymentProof> = emptyList(),
    val fulfillments: List<Shipment> = emptyList(),
)

@Serializable
data class OrderCustomer(
    val id: String? = null,
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val hasAccount: Boolean = false,
)

@Serializable
data class DriverRef(val id: String = "", val name: String = "")

@Serializable
data class OrderDetailItem(
    val id: String,
    val productId: String = "",
    val name: String = "",
    val variant: String? = null,
    val sku: String = "",
    val quantity: Int = 0,
    val unitPrice: Long = 0,
    val totalPrice: Long = 0,
    val imageUrl: String? = null,
)

@Serializable
data class OrderEvent(val id: String, val status: String = "", val message: String? = null, val createdAt: String = "")

@Serializable
data class StaffNote(val id: String, val body: String = "", val author: String = "", val createdAt: String = "")

@Serializable
data class PaymentTx(
    val id: String,
    val provider: String = "",
    val status: String = "",
    val amount: Long = 0,
    val currency: String = "",
    val createdAt: String = "",
)

@Serializable
data class PaymentProof(val id: String, val createdAt: String = "", val sizeBytes: Long = 0, val path: String = "")

@Serializable
data class Shipment(
    val id: String,
    val status: String = "",
    val trackingNumber: String? = null,
    val trackingCompany: String? = null,
    val trackingUrl: String? = null,
    val shippedAt: String? = null,
    val createdAt: String = "",
)

@Serializable
data class OrderPatch(
    val id: String,
    val status: String? = null,
    val paymentStatus: String? = null,
    val addNote: String? = null,
    val trackingNumber: String? = null,
    val trackingCompany: String? = null,
    val trackingUrl: String? = null,
)

@Serializable
data class OrderPatchResponse(
    val error: String? = null,
    val message: String? = null,
    val refundPending: Boolean = false,
    val cancelRefund: CancelRefund? = null,
)

@Serializable
data class CancelRefund(val amount: Long = 0, val pending: Boolean = false)

// ---------- Products ----------

@Serializable
data class ProductsPage(
    val rows: List<ProductRow> = emptyList(),
    val total: Int = 0,
    val counts: Map<String, Int> = emptyMap(),
    val page: Int = 1,
    val pages: Int = 1,
)

@Serializable
data class ProductImage(val id: String? = null, val url: String = "", val alt: String? = null)

@Serializable
data class InventoryRef(
    val id: String = "",
    val quantity: Int = 0,
    val reserved: Int = 0,
    val lowStockThreshold: Int = 5,
    val variantId: String? = null,
    val locationId: String? = null,
    val location: LocationRef? = null,
)

@Serializable
data class LocationRef(val id: String = "", val name: String = "")

@Serializable
data class VariantRow(
    val id: String,
    val name: String = "",
    val sku: String = "",
    val price: Long? = null,
    val inventory: List<InventoryRef> = emptyList(),
)

@Serializable
data class ProductRow(
    val id: String,
    val name: String = "",
    val slug: String = "",
    val sku: String = "",
    val status: String = "DRAFT",
    val basePrice: Long = 0,
    val compareAtPrice: Long? = null,
    val featured: Boolean = false,
    val trackInventory: Boolean = true,
    val continueSellingWhenOutOfStock: Boolean = false,
    val preorder: Boolean = false,
    val images: List<ProductImage> = emptyList(),
    val inventory: List<InventoryRef> = emptyList(),
    val variants: List<VariantRow> = emptyList(),
    val updatedAt: String = "",
)

@Serializable
data class ProductDetailResponse(val product: ProductDetail)

@Serializable
data class TagRef(val value: String = "")

@Serializable
data class CollectionLink(val collection: CollectionRow? = null)

@Serializable
data class ProductDetail(
    val id: String,
    val name: String = "",
    val slug: String = "",
    val sku: String = "",
    val barcode: String? = null,
    val status: String = "DRAFT",
    val description: String? = null,
    val shortDescription: String? = null,
    val brand: String? = null,
    val vendor: String? = null,
    val productType: String? = null,
    val basePrice: Long = 0,
    val compareAtPrice: Long? = null,
    val costPrice: Long? = null,
    val featured: Boolean = false,
    val trackInventory: Boolean = true,
    val continueSellingWhenOutOfStock: Boolean = false,
    val preorder: Boolean = false,
    val images: List<ProductImage> = emptyList(),
    val inventory: List<InventoryRef> = emptyList(),
    val variants: List<VariantRow> = emptyList(),
    val tags: List<TagRef> = emptyList(),
    val collections: List<CollectionLink> = emptyList(),
    val sharedInventory: Boolean = false,
)

@Serializable
data class ProductSaveResponse(val product: ProductRefId? = null)

@Serializable
data class ProductRefId(val id: String = "")

@Serializable
data class CollectionsPage(val rows: List<CollectionRow> = emptyList(), val total: Int = 0)

@Serializable
data class CollectionRow(val id: String, val name: String = "", val isActive: Boolean = true)

@Serializable
data class MediaUploadResponse(val asset: MediaAsset)

@Serializable
data class MediaAsset(val id: String = "", val url: String = "")

// ---------- Inventory ----------

@Serializable
data class InventoryPage(
    val items: List<StockItem> = emptyList(),
    val page: Int = 1,
    val pageSize: Int = 30,
    val total: Int = 0,
    val pages: Int = 1,
    val summary: StockSummary = StockSummary(),
)

@Serializable
data class StockSummary(val total: Int = 0, val low: Int = 0, val out: Int = 0, val units: Int = 0)

@Serializable
data class StockItem(
    val id: String,
    val productId: String = "",
    val variantId: String? = null,
    val name: String = "",
    val variant: String? = null,
    val sku: String = "",
    val productStatus: String = "ACTIVE",
    val trackInventory: Boolean = true,
    val sellsWhenOut: Boolean = false,
    val imageUrl: String? = null,
    val location: String? = null,
    val quantity: Int = 0,
    val reserved: Int = 0,
    val available: Int = 0,
    val lowStockThreshold: Int = 5,
    val state: String = "in",
    val movements: List<StockMovement> = emptyList(),
)

@Serializable
data class StockMovement(val id: String, val type: String = "", val quantity: Int = 0, val reason: String? = null, val createdAt: String = "")

@Serializable
data class InventoryAdjust(
    val id: String,
    val delta: Int,
    val reason: String,
    val movementType: String = "ADJUSTMENT",
    val lowStockThreshold: Int? = null,
)

// ---------- Customers ----------

@Serializable
data class CustomersPage(
    val rows: List<CustomerRow> = emptyList(),
    val total: Int = 0,
    val active: Int = 0,
    val disabled: Int = 0,
    val page: Int = 1,
    val pages: Int = 1,
)

@Serializable
data class Counts(val orders: Int = 0, val reviews: Int = 0)

@Serializable
data class CustomerTag(val id: String = "", val value: String = "")

@Serializable
data class CustomerRow(
    val id: String,
    val name: String = "",
    val email: String = "",
    val phone: String? = null,
    val isActive: Boolean = true,
    val createdAt: String = "",
    val lastLoginAt: String? = null,
    @SerialName("_count") val counts: Counts = Counts(),
    val totalSpent: Long = 0,
    val tags: List<CustomerTag> = emptyList(),
)

@Serializable
data class CustomerDetailResponse(val customer: CustomerDetail)

@Serializable
data class CustomerAddress(
    val id: String = "",
    val label: String? = null,
    val firstName: String = "",
    val lastName: String = "",
    val line1: String = "",
    val line2: String? = null,
    val city: String = "",
    val region: String? = null,
    val country: String = "",
    val phone: String? = null,
    val isDefault: Boolean = false,
)

@Serializable
data class CustomerOrder(
    val id: String,
    val orderNumber: String = "",
    val grandTotal: Long = 0,
    val currency: String = "USD",
    val status: String = "PENDING",
    val paymentStatus: String = "UNPAID",
    val createdAt: String = "",
    val items: List<OrderRowItem> = emptyList(),
)

@Serializable
data class CustomerNote(val id: String = "", val orderId: String = "", val body: String = "", val createdAt: String = "")

@Serializable
data class CustomerDetail(
    val id: String,
    val name: String = "",
    val email: String = "",
    val phone: String? = null,
    val isActive: Boolean = true,
    val createdAt: String = "",
    val lastLoginAt: String? = null,
    val addresses: List<CustomerAddress> = emptyList(),
    val orders: List<CustomerOrder> = emptyList(),
    val orderNotes: List<CustomerNote> = emptyList(),
    val orderTotal: Long = 0,
    @SerialName("_count") val counts: Counts = Counts(),
)

// ---------- Discounts ----------

@Serializable
data class Coupon(
    val id: String,
    val code: String = "",
    val isAutomatic: Boolean = false,
    val type: String = "PERCENTAGE",
    val value: Long = 0,
    val minSubtotal: Long? = null,
    val maxUses: Int? = null,
    val usedCount: Int = 0,
    val startsAt: String? = null,
    val expiresAt: String? = null,
    val isActive: Boolean = true,
    val appliesTo: String = "ALL_PRODUCTS",
    val productIds: List<String> = emptyList(),
    val collectionIds: List<String> = emptyList(),
    val buyQuantity: Int? = null,
    val getQuantity: Int? = null,
    val getDiscountPercent: Int? = null,
    val getAppliesTo: String? = null,
    val getProductIds: List<String> = emptyList(),
    val getCollectionIds: List<String> = emptyList(),
    val firstOrderOnly: Boolean = false,
    val oncePerCustomer: Boolean = false,
    val flashSale: Boolean = false,
    val createdAt: String = "",
)

@Serializable
data class CouponResponse(val coupon: Coupon? = null)

// ---------- Alerts ----------

@Serializable
data class AlertsResponse(val items: List<AlertItem> = emptyList(), val unread: Int = 0)

@Serializable
data class AlertItem(
    val id: String,
    val title: String = "",
    val body: String = "",
    val kind: String = "messages",
    val path: String = "/admin",
    val read: Boolean = false,
    val createdAt: String = "",
)

@Serializable
data class AlertsMark(val ids: List<String>? = null, val all: Boolean? = null, val clear: Boolean? = null)

@Serializable
data class AlertPrefs(
    val orders: Boolean = true,
    val lowStock: Boolean = true,
    val messages: Boolean = true,
    val security: Boolean = true,
    val summary: Boolean = true,
)

@Serializable
data class DeviceRegistration(
    val installId: String,
    val fcmToken: String? = null,
    val prefs: AlertPrefs? = null,
    val appVersion: String? = null,
    val model: String? = null,
)

@Serializable
data class DeviceState(
    val registered: Boolean = false,
    val prefs: AlertPrefs = AlertPrefs(),
    val hasPushToken: Boolean = false,
    val pushConfigured: Boolean = false,
)

@Serializable
data class TestAlertRequest(val test: Boolean = true)

@Serializable
data class TestAlertResponse(val sent: Int = 0, val failed: Int = 0, val pushConfigured: Boolean = false)

@Serializable
data class OkResponse(val ok: Boolean = false)

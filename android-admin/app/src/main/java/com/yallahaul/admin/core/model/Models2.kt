package com.yallahaul.admin.core.model

import kotlinx.serialization.Serializable

// Models for the v1.1 features: manual orders, drivers, WhatsApp follow-up, scanning, chats,
// reviews and questions, returns and refunds, unfinished checkouts and reports. Money in cents.

// ---------- Order extras ----------

@Serializable
data class WhatsappInfo(
    val link: String? = null,
    val problem: String? = null,
    val outcomes: List<WhatsappOutcome> = emptyList(),
)

@Serializable
data class WhatsappOutcome(val id: String, val label: String = "")

@Serializable
data class WhatsappOutcomeRequest(val id: String, val whatsappOutcome: String, val detail: String? = null)

@Serializable
data class ManualOrderResponse(val order: ManualOrderRef? = null)

@Serializable
data class ManualOrderRef(val id: String = "", val orderNumber: String = "", val grandTotal: Long = 0)

// ---------- Drivers ----------

@Serializable
data class DriversResponse(val canManage: Boolean = false, val drivers: List<DriverRow> = emptyList())

@Serializable
data class DriverRow(
    val id: String,
    val name: String = "",
    val phone: String = "",
    val active: Boolean = true,
    val currency: String = "USD",
    val out: List<DriverOrder> = emptyList(),
    val outCollect: Long = 0,
    val cash: List<DriverCash> = emptyList(),
    val cashTotal: Long = 0,
    val delivered30: Int = 0,
)

@Serializable
data class DriverOrder(val id: String, val orderNumber: String = "", val toCollect: Long = 0)

@Serializable
data class DriverCash(val id: String, val orderNumber: String = "", val amount: Long = 0, val deliveredAt: String = "")

@Serializable
data class AssignDriverRequest(val orderIds: List<String>, val driverId: String?)

@Serializable
data class AssignDriverResponse(val updated: Int = 0)

@Serializable
data class SettleRequest(val driverId: String, val orderIds: List<String>)

@Serializable
data class SettleResponse(val orders: Int = 0, val amount: Long = 0)

@Serializable
data class DriverSave(val id: String? = null, val name: String? = null, val phone: String? = null, val active: Boolean? = null)

// ---------- Scanning ----------

@Serializable
data class LookupResponse(
    val code: String = "",
    val productId: String = "",
    val name: String = "",
    val variant: String = "",
    val sku: String = "",
    val image: String = "",
    val items: List<LookupItem> = emptyList(),
)

@Serializable
data class LookupItem(val id: String, val location: String = "", val quantity: Int = 0, val reserved: Int = 0)

// ---------- Product extras ----------

@Serializable
data class BulkProducts(val action: String = "bulk", val ids: List<String>, val bulkAction: String)

@Serializable
data class BulkResponse(val ok: Boolean = false, val count: Int = 0)

@Serializable
data class VariantFull(
    val id: String,
    val name: String = "",
    val sku: String = "",
    val barcode: String? = null,
    val optionJson: String = "{}",
    val price: Long? = null,
    val compareAtPrice: Long? = null,
    val weight: Double? = null,
    val weightUnit: String? = null,
)

@Serializable
data class ProductVariantsResponse(val product: ProductVariantsOnly)

@Serializable
data class ProductVariantsOnly(val variants: List<VariantFull> = emptyList())

// ---------- Live chat ----------

@Serializable
data class Presence(val online: Boolean = false, val name: String = "", val since: Long? = null, val staffConnected: Int = 0)

@Serializable
data class LiveInboxResponse(val presence: Presence = Presence(), val inbox: List<LiveChatRow> = emptyList(), val available: Boolean = false)

@Serializable
data class LiveChatRow(
    val id: String,
    val lang: String? = null,
    val waitingSince: String? = null,
    val updatedAt: String = "",
    val customer: String? = null,
    val last: LiveLast? = null,
)

@Serializable
data class LiveLast(val role: String = "", val text: String = "", val at: String = "")

@Serializable
data class LiveThreadResponse(val thread: LiveThread)

@Serializable
data class LiveThread(
    val id: String,
    val waitingSince: String? = null,
    val customer: LiveCustomer? = null,
    val messages: List<ChatMessage> = emptyList(),
)

@Serializable
data class LiveCustomer(val id: String = "", val name: String = "")

@Serializable
data class ChatMessage(val id: String, val role: String = "", val text: String = "", val at: String = "", val author: String? = null)

@Serializable
data class LiveChatAction(val action: String, val online: Boolean? = null, val conversationId: String? = null, val text: String? = null)

@Serializable
data class PresenceResponse(val presence: Presence = Presence())

// ---------- Team chat ----------

@Serializable
data class TeamHome(val me: TeamMe = TeamMe(), val channels: List<TeamChannel> = emptyList(), val staff: List<TeamPerson> = emptyList())

@Serializable
data class TeamMe(val id: String = "", val isOwner: Boolean = false)

@Serializable
data class TeamChannel(
    val id: String,
    val kind: String = "team",
    val title: String = "",
    val unread: Int = 0,
    val muted: Boolean = false,
    val lastAt: String? = null,
    val last: String? = null,
)

@Serializable
data class TeamPerson(val id: String, val name: String = "")

@Serializable
data class TeamMessagesResponse(val messages: List<TeamMessage> = emptyList())

@Serializable
data class TeamMessage(val id: String, val authorId: String = "", val authorName: String = "", val text: String = "", val at: String = "", val deleted: Boolean = false)

@Serializable
data class TeamAction(val action: String, val channelId: String? = null, val userId: String? = null, val text: String? = null, val messageId: String? = null, val muted: Boolean? = null)

@Serializable
data class TeamSendResponse(val message: TeamMessage? = null, val channelId: String? = null)

// ---------- Reviews and questions ----------

@Serializable
data class ReviewsResponse(val waiting: Int = 0, val reviews: List<ReviewRow> = emptyList())

@Serializable
data class ReviewRow(
    val id: String,
    val rating: Int = 0,
    val title: String? = null,
    val body: String? = null,
    val photos: List<String> = emptyList(),
    val approved: Boolean = false,
    val featured: Boolean = false,
    val createdAt: String = "",
    val author: String = "",
    val orderNumber: String? = null,
    val product: ItemProduct = ItemProduct(),
)

@Serializable
data class ItemProduct(val id: String = "", val name: String = "", val imageUrl: String? = null)

@Serializable
data class ReviewPatch(val id: String, val approved: Boolean? = null, val featured: Boolean? = null)

@Serializable
data class QuestionsResponse(val open: Int = 0, val questions: List<QuestionRow> = emptyList())

@Serializable
data class QuestionRow(
    val id: String,
    val question: String = "",
    val answer: String? = null,
    val published: Boolean = false,
    val name: String = "",
    val createdAt: String = "",
    val product: ItemProduct = ItemProduct(),
)

@Serializable
data class QuestionPatch(val id: String, val answer: String? = null, val published: Boolean? = null)

// ---------- Returns and refunds ----------

@Serializable
data class ReturnRow(
    val id: String,
    val orderId: String = "",
    val status: String = "REQUESTED",
    val reason: String = "",
    val notes: String? = null,
    val refundAmount: Long = 0,
    val restock: Boolean = true,
    val createdAt: String = "",
    val items: List<ReturnItemRow> = emptyList(),
    val order: ReturnOrder? = null,
)

@Serializable
data class ReturnItemRow(val id: String = "", val orderItemId: String = "", val quantity: Int = 0, val condition: String? = null)

@Serializable
data class ReturnOrder(val id: String = "", val orderNumber: String = "", val currency: String = "USD", val grandTotal: Long = 0, val items: List<ReturnOrderItem> = emptyList())

@Serializable
data class ReturnOrderItem(val id: String = "", val name: String = "")

@Serializable
data class ReturnCreate(val orderId: String, val items: List<ReturnLine>, val restock: Boolean, val refundAmount: Long, val reason: String)

@Serializable
data class ReturnLine(val orderItemId: String, val quantity: Int)

@Serializable
data class ReturnAction(val action: String, val note: String? = null)

@Serializable
data class RefundRequest(val orderId: String, val amount: Long, val reason: String)

@Serializable
data class ReauthRequest(val password: String? = null, val code: String? = null)

@Serializable
data class ReauthResponse(val ok: Boolean = false, val seconds: Int = 600, val token: String? = null)

// ---------- Unfinished checkouts ----------

@Serializable
data class UnfinishedResponse(val checkouts: List<UnfinishedRow> = emptyList())

@Serializable
data class UnfinishedRow(
    val id: String,
    val name: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val subtotal: Long = 0,
    val currency: String = "USD",
    val lines: List<CartLine> = emptyList(),
    val lastActivity: String = "",
    val whatsappAt: String? = null,
    val emailSent: Boolean = false,
    val place: String? = null,
    val whatsappLink: String? = null,
)

@Serializable
data class CartLine(val name: String = "", val quantity: Int = 1, val unitPrice: Double = 0.0)

@Serializable
data class UnfinishedAction(val id: String, val action: String)

// ---------- Reports ----------

@Serializable
data class SalesReport(
    val periodDays: Int = 30,
    val orders: Int = 0,
    val revenue: Long = 0,
    val averageOrderValue: Long = 0,
    val itemsSold: Int = 0,
    val newCustomers: Int = 0,
)

@Serializable
data class ProfitResponse(val report: ProfitReport = ProfitReport(), val truncated: Boolean = false)

@Serializable
data class ProfitReport(
    val currency: String = "USD",
    val ordersPlaced: Int = 0,
    val grossOrderValue: Long = 0,
    val cancelled: CountValue = CountValue(),
    val refunded: Long = 0,
    val netSales: Long = 0,
    val shippingCharged: Long = 0,
    val discounts: Long = 0,
    val productCost: CostBlock = CostBlock(),
    val delivery: Money2 = Money2(),
    val packaging: Money2 = Money2(),
    val expenses: Money2 = Money2(),
    val byProduct: List<ProductProfit> = emptyList(),
    val adSpend: AdSpendBlock = AdSpendBlock(),
    val profit: ProfitTotals = ProfitTotals(),
    val estimated: Boolean = false,
)

@Serializable
data class CountValue(val orders: Int = 0, val value: Long = 0)

@Serializable
data class CostBlock(val total: Long = 0, val missingSales: Long = 0)

@Serializable
data class Money2(val total: Long = 0)

@Serializable
data class ProductProfit(val productId: String = "", val name: String = "", val units: Int = 0, val sales: Long = 0, val cost: Long? = null, val profit: Long? = null, val margin: Double? = null)

@Serializable
data class AdSpendBlock(val total: Long = 0, val byPlatform: List<PlatformSpend> = emptyList())

@Serializable
data class PlatformSpend(val platform: String = "", val total: Long = 0)

@Serializable
data class ProfitTotals(val collectedSoFar: Long = 0, val ifUnpaidCollected: Long = 0)

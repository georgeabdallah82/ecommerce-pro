package com.yallahaul.admin.core.data

import com.yallahaul.admin.core.model.Coupon
import com.yallahaul.admin.core.model.ProductDetail
import com.yallahaul.admin.core.model.ProductImage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** What the product editor holds. Money in minor units (cents). */
data class ProductDraft(
    val name: String = "",
    val sku: String = "",
    val barcode: String = "",
    val description: String = "",
    val descriptionEdited: Boolean = true,
    val shortDescription: String = "",
    val basePrice: Long? = null,
    val compareAtPrice: Long? = null,
    val costPrice: Long? = null,
    val status: String = "DRAFT",
    val featured: Boolean = false,
    val brand: String = "",
    val vendor: String = "",
    val productType: String = "",
    val tags: List<String> = emptyList(),
    val collectionIds: List<String> = emptyList(),
    val images: List<ProductImage> = emptyList(),
    val trackInventory: Boolean = true,
    val continueSelling: Boolean = false,
    val quantity: Int = 0,
    val lowStockThreshold: Int = 5,
)


/**
 * Bodies for /api/admin/products. An edit only sends the fields the app edits, so everything the
 * phone doesn't show (variants, SEO, metafields, sales channels, video, size guide) stays exactly
 * as it is. A formatted (HTML) description is only sent when the person chose to replace it.
 */
object ProductPayloads {
    private fun nullable(value: Long?) = if (value == null) JsonNull else JsonPrimitive(value)
    private fun text(value: String) = value.trim()
    private fun images(list: List<ProductImage>) = JsonArray(list.map { image ->
        buildJsonObject {
            image.id?.let { put("id", it) }
            put("url", image.url)
            image.alt?.takeIf { it.isNotBlank() }?.let { put("alt", it) }
        }
    })

    fun create(d: ProductDraft): JsonObject = buildJsonObject {
        put("name", text(d.name))
        put("sku", text(d.sku))
        if (d.barcode.isNotBlank()) put("barcode", text(d.barcode))
        if (d.description.isNotBlank()) put("description", d.description)
        if (d.shortDescription.isNotBlank()) put("shortDescription", d.shortDescription)
        put("basePrice", d.basePrice ?: 0)
        put("compareAtPrice", nullable(d.compareAtPrice))
        put("costPrice", nullable(d.costPrice))
        put("status", d.status)
        put("featured", d.featured)
        if (d.brand.isNotBlank()) put("brand", text(d.brand))
        if (d.vendor.isNotBlank()) put("vendor", text(d.vendor))
        if (d.productType.isNotBlank()) put("productType", text(d.productType))
        putJsonArray("tags") { d.tags.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("collectionIds") { d.collectionIds.forEach { add(JsonPrimitive(it)) } }
        put("images", images(d.images))
        put("trackInventory", d.trackInventory)
        put("continueSellingWhenOutOfStock", d.continueSelling)
        put("quantity", d.quantity.coerceAtLeast(0))
        put("lowStockThreshold", d.lowStockThreshold.coerceAtLeast(0))
    }

    fun update(d: ProductDraft, original: ProductDetail): JsonObject = buildJsonObject {
        put("name", text(d.name))
        put("sku", text(d.sku))
        put("barcode", text(d.barcode))
        if (d.descriptionEdited) put("description", d.description)
        put("shortDescription", d.shortDescription)
        put("basePrice", d.basePrice ?: original.basePrice)
        put("compareAtPrice", nullable(d.compareAtPrice))
        put("costPrice", nullable(d.costPrice))
        if (d.status != original.status) {
            put("status", d.status)
            if (d.status == "ACTIVE") put("publishedAt", java.time.Instant.now().toString())
        }
        put("featured", d.featured)
        put("brand", text(d.brand))
        put("vendor", text(d.vendor))
        put("productType", text(d.productType))
        putJsonArray("tags") { d.tags.forEach { add(JsonPrimitive(it)) } }
        putJsonArray("collectionIds") { d.collectionIds.forEach { add(JsonPrimitive(it)) } }
        put("images", images(d.images))
        put("trackInventory", d.trackInventory)
        put("continueSellingWhenOutOfStock", d.continueSelling)
    }

    /**
     * The product's options: every option is sent (the server removes the ones left out), each with
     * the fields the phone doesn't edit (option values, weight) exactly as they were. Quantities are
     * not sent, so stock stays as it is; a new option starts with 0 in stock.
     */
    fun variants(list: List<VariantDraft>): JsonObject = buildJsonObject {
        put("variants", JsonArray(list.map { v ->
            buildJsonObject {
                v.id?.let { put("id", it) }
                put("name", v.name.trim().ifBlank { "Default Title" })
                put("sku", v.sku.trim())
                put("barcode", v.barcode.trim())
                put("optionJson", v.original?.optionJson ?: kotlinx.serialization.json.Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), buildJsonObject { put("Option", v.name.trim()) }))
                put("price", nullable(v.price))
                put("compareAtPrice", nullable(v.compareAtPrice))
                v.original?.weight?.let { put("weight", it) }
                v.original?.weightUnit?.let { put("weightUnit", it) }
                if (v.id == null) put("quantity", 0)
            }
        }))
    }

    fun status(status: String): JsonObject = buildJsonObject {
        put("status", status)
        if (status == "ACTIVE") put("publishedAt", java.time.Instant.now().toString())
    }
}

/** One product option as the editor holds it. [id] is null for a new one; [original] keeps what the phone doesn't edit. */
data class VariantDraft(
    val id: String? = null,
    val name: String = "",
    val sku: String = "",
    val barcode: String = "",
    val price: Long? = null,
    val compareAtPrice: Long? = null,
    val original: com.yallahaul.admin.core.model.VariantFull? = null,
)

/** What the discount editor holds. A percentage is 1-100; a fixed amount and the minimum are in cents. */
data class CouponDraft(
    val code: String = "",
    val type: String = "PERCENTAGE",
    val value: Long = 10,
    val isAutomatic: Boolean = false,
    val minSubtotal: Long? = null,
    val maxUses: Int? = null,
    val startsAt: String? = null,
    val expiresAt: String? = null,
    val firstOrderOnly: Boolean = false,
    val oncePerCustomer: Boolean = false,
    val isActive: Boolean = true,
)

/**
 * Bodies for /api/admin/coupons. The full edit there rebuilds every field from the body, so an edit
 * sends back what the app doesn't show (which products or collections it covers, buy X get Y,
 * flash sale) exactly as it was -- otherwise saving from the phone would widen a discount meant
 * for some products to the whole store.
 */
object CouponPayloads {
    private fun strings(list: List<String>) = JsonArray(list.map { JsonPrimitive(it) })
    private fun nullableLong(value: Long?) = if (value == null) JsonNull else JsonPrimitive(value)
    private fun nullableInt(value: Int?) = if (value == null) JsonNull else JsonPrimitive(value)
    private fun nullableText(value: String?) = if (value.isNullOrBlank()) JsonNull else JsonPrimitive(value)

    fun create(d: CouponDraft): JsonObject = buildJsonObject {
        put("code", d.code.trim().uppercase())
        put("type", d.type)
        put("value", d.value)
        put("isAutomatic", d.isAutomatic)
        put("minSubtotal", nullableLong(d.minSubtotal))
        put("maxUses", nullableInt(d.maxUses))
        put("startsAt", nullableText(d.startsAt))
        put("expiresAt", nullableText(d.expiresAt))
        put("firstOrderOnly", d.firstOrderOnly)
        put("oncePerCustomer", d.oncePerCustomer && !d.isAutomatic)
        put("isActive", d.isActive)
        put("appliesTo", "ALL_PRODUCTS")
    }

    fun update(original: Coupon, d: CouponDraft): JsonObject = buildJsonObject {
        put("id", original.id)
        put("code", d.code.trim().uppercase())
        put("type", d.type)
        put("value", d.value)
        put("isAutomatic", d.isAutomatic)
        put("minSubtotal", nullableLong(d.minSubtotal))
        put("maxUses", nullableInt(d.maxUses))
        put("startsAt", nullableText(d.startsAt))
        put("expiresAt", nullableText(d.expiresAt))
        put("firstOrderOnly", d.firstOrderOnly)
        put("oncePerCustomer", d.oncePerCustomer && !d.isAutomatic)
        put("isActive", d.isActive)
        // Kept as they are:
        put("flashSale", original.flashSale)
        put("appliesTo", original.appliesTo)
        put("productIds", strings(original.productIds))
        put("collectionIds", strings(original.collectionIds))
        put("buyQuantity", nullableInt(original.buyQuantity))
        put("getQuantity", nullableInt(original.getQuantity))
        // Sent only when set: the server reads an empty value as 0%.
        original.getDiscountPercent?.let { put("getDiscountPercent", it) }
        put("getAppliesTo", nullableText(original.getAppliesTo))
        put("getProductIds", strings(original.getProductIds))
        put("getCollectionIds", strings(original.getCollectionIds))
    }

    fun toggle(id: String, active: Boolean): JsonObject = buildJsonObject {
        put("id", id)
        put("isActive", active)
    }
}

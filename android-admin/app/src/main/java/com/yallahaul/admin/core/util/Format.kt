package com.yallahaul.admin.core.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale

object Money {
    /** 125050 cents in USD -> "$1,250.50". */
    fun format(minor: Long, currency: String, compact: Boolean = false): String {
        val code = currency.ifBlank { "USD" }.uppercase()
        val fmt = NumberFormat.getCurrencyInstance(Locale.US)
        runCatching { fmt.currency = Currency.getInstance(code) }
        val digits = runCatching { Currency.getInstance(code).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
        val major = BigDecimal.valueOf(minor).movePointLeft(digits)
        if (compact && major.abs() >= BigDecimal(10_000)) {
            val symbol = fmt.currency?.getSymbol(Locale.US) ?: code
            val value = major.toDouble()
            val (n, suffix) = when {
                kotlin.math.abs(value) >= 1_000_000 -> value / 1_000_000 to "M"
                else -> value / 1_000 to "K"
            }
            return symbol + String.format(Locale.US, if (n >= 100) "%.0f" else "%.1f", n) + suffix
        }
        fmt.minimumFractionDigits = if (compact && major.stripTrailingZeros().scale() <= 0) 0 else digits
        fmt.maximumFractionDigits = digits
        return fmt.format(major)
    }

    /** "12.5" -> 1250 cents. Null for empty or invalid input. */
    fun parse(text: String, currency: String = "USD"): Long? {
        val clean = text.trim().replace(",", "")
        if (clean.isEmpty()) return null
        val digits = runCatching { Currency.getInstance(currency.uppercase()).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
        return runCatching { BigDecimal(clean).setScale(digits, RoundingMode.HALF_UP).movePointRight(digits).longValueExact() }.getOrNull()?.takeIf { it >= 0 }
    }

    /** 1250 cents -> "12.50" for an input field. */
    fun toInput(minor: Long?, currency: String = "USD"): String {
        if (minor == null) return ""
        val digits = runCatching { Currency.getInstance(currency.uppercase()).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
        return BigDecimal.valueOf(minor).movePointLeft(digits).setScale(digits).toPlainString()
    }

    fun symbol(currency: String): String = runCatching { Currency.getInstance(currency.uppercase()).getSymbol(Locale.US) }.getOrDefault(currency)
}

object Dates {
    fun parse(iso: String?): Instant? = iso?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() }

    fun zone(timezone: String?): ZoneId = runCatching { ZoneId.of(timezone ?: "") }.getOrDefault(ZoneId.systemDefault())

    /** "Just now", "5 min ago", "3 h ago", "Yesterday", "12 Mar". */
    fun relative(iso: String?, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val instant = parse(iso) ?: return ""
        val diff = Duration.between(instant, now)
        val then = instant.atZone(zone)
        val today = now.atZone(zone).toLocalDate()
        return when {
            diff.isNegative || diff.toMinutes() < 1 -> "Just now"
            diff.toMinutes() < 60 -> "${diff.toMinutes()} min ago"
            diff.toHours() < 12 && then.toLocalDate() == today -> "${diff.toHours()} h ago"
            then.toLocalDate() == today -> "Today, " + then.format(TIME)
            then.toLocalDate() == today.minusDays(1) -> "Yesterday, " + then.format(TIME)
            then.year == today.year -> then.format(DAY_MONTH)
            else -> then.format(FULL_DATE)
        }
    }

    fun dateTime(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String = parse(iso)?.atZone(zone)?.format(DATE_TIME) ?: ""
    fun date(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String = parse(iso)?.atZone(zone)?.format(FULL_DATE) ?: ""

    fun dayLabel(day: String): String = runCatching { LocalDate.parse(day).format(DAY_MONTH) }.getOrDefault(day)
    fun shortDay(day: String): String = runCatching { LocalDate.parse(day).format(DateTimeFormatter.ofPattern("d MMM", Locale.US)) }.getOrDefault(day)

    fun sectionLabel(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String {
        val date = parse(iso)?.atZone(zone)?.toLocalDate() ?: return ""
        val today = ZonedDateTime.now(zone).toLocalDate()
        return when (date) {
            today -> "Today"
            today.minusDays(1) -> "Yesterday"
            else -> date.format(if (date.year == today.year) DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.US) else FULL_DATE)
        }
    }

    private val TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
    private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMM", Locale.US)
    private val FULL_DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)
    private val DATE_TIME = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", Locale.US)
}

object Labels {
    fun orderStatus(status: String) = when (status) {
        "PENDING" -> "Pending"
        "CONFIRMED" -> "Confirmed"
        "PROCESSING" -> "Processing"
        "SHIPPED" -> "Out for delivery"
        "DELIVERED" -> "Delivered"
        "CANCELLED" -> "Cancelled"
        "REFUNDED" -> "Refunded"
        else -> status.lowercase().replaceFirstChar { it.uppercase() }
    }

    /** The button that moves an order to [status]. */
    fun orderAction(status: String) = when (status) {
        "CONFIRMED" -> "Confirm order"
        "PROCESSING" -> "Start preparing"
        "SHIPPED" -> "Send out for delivery"
        "DELIVERED" -> "Mark as delivered"
        "CANCELLED" -> "Cancel order"
        else -> "Move to ${orderStatus(status)}"
    }

    fun paymentStatus(status: String) = when (status) {
        "UNPAID" -> "Unpaid"
        "PENDING" -> "Payment pending"
        "PAID" -> "Paid"
        "FAILED" -> "Payment failed"
        "REFUNDED" -> "Refunded"
        "PARTIALLY_REFUNDED" -> "Partly refunded"
        else -> status
    }

    fun paymentMethod(method: String) = when (method) {
        "COD" -> "Cash on delivery"
        "CARD" -> "Card"
        "BANK_TRANSFER" -> "Bank transfer"
        "WALLET" -> "Wallet"
        else -> method
    }

    fun productStatus(status: String) = when (status) {
        "ACTIVE" -> "Active"
        "DRAFT" -> "Draft"
        "ARCHIVED" -> "Archived"
        else -> status
    }

    fun movement(type: String) = when (type) {
        "RECEIPT" -> "Received"
        "SALE_RESERVATION" -> "Reserved for an order"
        "SALE_RELEASE" -> "Released from an order"
        "SALE_FULFILLMENT" -> "Sold"
        "ADJUSTMENT" -> "Adjusted"
        "RETURN" -> "Returned"
        "DAMAGE" -> "Damaged"
        "TRANSFER" -> "Transferred"
        else -> type
    }

    fun role(role: String) = when (role) {
        "SUPER_ADMIN" -> "Store owner"
        "ADMIN" -> "Admin"
        "MANAGER" -> "Manager"
        "SUPPORT" -> "Support"
        "EDITOR" -> "Editor"
        else -> role
    }

    fun initials(name: String): String = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
}

/** Builds a full address for a store path ("/api/media/x" -> "https://yallahaul.com/api/media/x"). */
fun absoluteUrl(base: String, url: String?): String? {
    if (url.isNullOrBlank()) return null
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    return base.trimEnd('/') + "/" + url.trimStart('/')
}

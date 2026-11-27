package com.yallahaul.admin

import com.yallahaul.admin.core.data.CouponDraft
import com.yallahaul.admin.core.data.CouponPayloads
import com.yallahaul.admin.core.data.ProductDraft
import com.yallahaul.admin.core.data.ProductPayloads
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.Coupon
import com.yallahaul.admin.core.model.ProductDetail
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.core.network.httpError
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.core.util.absoluteUrl
import com.yallahaul.admin.ui.discounts.CouponState
import com.yallahaul.admin.ui.discounts.state
import com.yallahaul.admin.ui.navigation.Routes
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class LogicTest {
    @Test fun moneyFormatsAndParsesMinorUnits() {
        assertEquals("$1,250.50", Money.format(125050, "USD"))
        assertEquals("$0.00", Money.format(0, "USD"))
        assertEquals(1250L, Money.parse("12.5"))
        assertEquals(1999L, Money.parse("19.99"))
        assertEquals(100000L, Money.parse("1,000"))
        assertNull(Money.parse("abc"))
        assertNull(Money.parse(""))
        assertNull(Money.parse("-5"))
        assertEquals("12.50", Money.toInput(1250))
        assertEquals("$12.5K", Money.format(1_250_000, "USD", compact = true))
    }

    @Test fun serverErrorsBecomeReadableErrors() {
        val auth = httpError(401, """{"error":"Please sign in to continue."}""")
        assertEquals(AppError.Kind.Unauthorized, auth.kind)
        assertTrue(auth.isAuth)
        val enroll = httpError(403, """{"error":"Turn on 2-step login first","code":"ENROLL_REQUIRED"}""")
        assertEquals("ENROLL_REQUIRED", enroll.code)
        assertEquals(AppError.Kind.Conflict, httpError(409, null).kind)
        assertEquals(AppError.Kind.RateLimited, httpError(429, "").kind)
        val server = httpError(500, "<html>oops</html>")
        assertEquals(AppError.Kind.Server, server.kind)
        assertFalse(server.message.contains("html"))
    }

    @Test fun productEditKeepsWhatThePhoneDoesNotShow() {
        val original = ProductDetail(id = "p1", name = "Mop", sku = "M1", status = "ACTIVE", basePrice = 1000, description = "<p>Rich</p>")
        val body = ProductPayloads.update(ProductDraft(name = "Mop", sku = "M1", status = "ACTIVE", basePrice = 1200, descriptionEdited = false), original)
        assertFalse("a formatted description is not overwritten", body.containsKey("description"))
        assertFalse("status unchanged is not sent", body.containsKey("status"))
        assertFalse("variants are never sent", body.containsKey("variants"))
        assertEquals(JsonNull, body["compareAtPrice"])
        assertEquals("1200", body["basePrice"]!!.jsonPrimitive.content)
        val activated = ProductPayloads.update(ProductDraft(name = "Mop", sku = "M1", status = "DRAFT", basePrice = 1200), original)
        assertEquals("DRAFT", activated["status"]!!.jsonPrimitive.content)
    }

    @Test fun couponEditSendsBackItsScope() {
        val original = Coupon(id = "c1", code = "SUMMER", type = "PERCENTAGE", value = 10, appliesTo = "SPECIFIC_PRODUCTS", productIds = listOf("p1", "p2"), flashSale = false)
        val body = CouponPayloads.update(original, CouponDraft(code = "summer", type = "PERCENTAGE", value = 15))
        assertEquals("SUMMER", body["code"]!!.jsonPrimitive.content)
        assertEquals("SPECIFIC_PRODUCTS", body["appliesTo"]!!.jsonPrimitive.content)
        assertEquals(2, body["productIds"]!!.jsonArray.size)
        assertFalse("an unset get-percentage is not sent (the server reads empty as 0%)", body.containsKey("getDiscountPercent"))
        val auto = CouponPayloads.create(CouponDraft(code = "AUTO", isAutomatic = true, oncePerCustomer = true))
        assertEquals("false", auto["oncePerCustomer"]!!.jsonPrimitive.content)
    }

    @Test fun couponStates() {
        val now = Instant.parse("2026-11-27T10:00:00Z")
        assertEquals(CouponState.Active, Coupon(id = "a").state(now))
        assertEquals(CouponState.Off, Coupon(id = "a", isActive = false).state(now))
        assertEquals(CouponState.Expired, Coupon(id = "a", expiresAt = "2026-11-01T00:00:00Z").state(now))
        assertEquals(CouponState.Scheduled, Coupon(id = "a", startsAt = "2026-12-01T00:00:00Z").state(now))
        assertEquals(CouponState.UsedUp, Coupon(id = "a", maxUses = 5, usedCount = 5).state(now))
    }

    @Test fun alertLinksOpenTheRightScreenWithinPermissions() {
        val owner = AppUser(id = "u", permissions = listOf("orders.view", "inventory.view", "dashboard.view"))
        assertEquals("order/abc123", Routes.fromAlertPath("/admin/orders/abc123", owner))
        assertEquals(Routes.ORDERS, Routes.fromAlertPath("/admin/orders", owner))
        assertEquals("inventory-filtered/low", Routes.fromAlertPath("/admin/inventory", owner))
        assertEquals(Routes.DASHBOARD, Routes.fromAlertPath("/admin", owner))
        assertEquals(Routes.ALERTS, Routes.fromAlertPath("/admin/reviews", owner))
        assertEquals(Routes.ALERTS, Routes.fromAlertPath("/admin/orders/../../x", owner))
        val editor = AppUser(id = "e", permissions = listOf("products.view"))
        assertEquals(Routes.ALERTS, Routes.fromAlertPath("/admin/orders/abc", editor))
    }

    @Test fun storePathsResolveAgainstTheStore() {
        assertEquals("https://yallahaul.com/api/media/x.jpg", absoluteUrl("https://yallahaul.com", "/api/media/x.jpg"))
        assertEquals("https://cdn.example/x.jpg", absoluteUrl("https://yallahaul.com", "https://cdn.example/x.jpg"))
        assertNull(absoluteUrl("https://yallahaul.com", ""))
    }
}

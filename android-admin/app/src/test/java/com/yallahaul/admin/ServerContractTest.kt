package com.yallahaul.admin

import com.yallahaul.admin.core.di.AppModule
import com.yallahaul.admin.core.model.*
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Real answers recorded from the Yalla Haul backend (scripts/mobile-api-e2e.ts against a local copy
 * of the store) must parse into the app's models: this catches any drift between server and app.
 */
class ServerContractTest {
    private val json = AppModule.json()
    private fun <T> load(name: String, serializer: KSerializer<T>): T {
        val text = javaClass.classLoader!!.getResource("fixtures/$name.json")!!.readText()
        return json.decodeFromString(serializer, text)
    }

    @Test fun dashboard() {
        val d = load("dashboard", DashboardResponse.serializer())
        assertEquals(30, d.daily.size)
        assertTrue(d.orders.total >= 2)
        assertTrue(d.revenue.total > 0)
        assertTrue(d.recentOrders.isNotEmpty())
        assertTrue(d.recentOrders.all { it.id.isNotBlank() && it.orderNumber.isNotBlank() })
    }

    @Test fun ordersListAndDetail() {
        val list = load("orders", OrdersPage.serializer())
        assertTrue(list.rows.isNotEmpty())
        assertNotNull(list.counts)
        assertTrue(list.rows.first().items.isNotEmpty())
        val detail = load("order", OrderDetailResponse.serializer())
        assertEquals("Rana Haddad", detail.order.customer.name)
        assertEquals("Beirut", detail.order.shippingAddress["city"])
        assertTrue(detail.actions.canManage)
        assertTrue("CONFIRMED" in detail.actions.nextStatuses)
        assertFalse("REFUNDED" in detail.actions.nextStatuses)
    }

    @Test fun products() {
        val page = load("products", ProductsPage.serializer())
        assertTrue(page.rows.isNotEmpty())
        assertTrue(page.counts.containsKey("ACTIVE"))
        val detail = load("product", ProductDetailResponse.serializer())
        assertTrue(detail.product.sku.isNotBlank())
        assertTrue(detail.product.basePrice > 0)
        load("collections", CollectionsPage.serializer())
    }

    @Test fun inventory() {
        val page = load("inventory", InventoryPage.serializer())
        assertTrue(page.items.isNotEmpty())
        assertTrue(page.items.all { it.state in setOf("in", "low", "out") && it.available == it.quantity - it.reserved })
    }

    @Test fun customersDiscountsAlerts() {
        val customers = load("customers", CustomersPage.serializer())
        assertTrue(customers.rows.isNotEmpty())
        load("customer", CustomerDetailResponse.serializer())
        val coupons = load("coupons", ListSerializer(Coupon.serializer()))
        assertTrue(coupons.isNotEmpty())
        val alerts = load("alerts", AlertsResponse.serializer())
        assertTrue(alerts.items.any { it.kind == "lowStock" })
        val device = load("device", DeviceState.serializer())
        assertTrue(device.registered)
        assertFalse(device.prefs.summary)
        val me = load("me", MeResponse.serializer())
        assertTrue(me.user.can("orders.view"))
        assertEquals("USD", me.store.currency)
    }

    @Test fun v11Answers() {
        val drivers = load("drivers", DriversResponse.serializer())
        assertTrue(drivers.drivers.isNotEmpty())
        val delivered = load("order-delivered", OrderDetailResponse.serializer())
        assertTrue(delivered.actions.canReturn)
        val order = load("order", OrderDetailResponse.serializer())
        assertNotNull(order)
        val reviews = load("reviews", ReviewsResponse.serializer())
        assertTrue(reviews.reviews.isNotEmpty())
        val questions = load("questions", QuestionsResponse.serializer())
        assertTrue(questions.questions.isNotEmpty())
        val unfinished = load("unfinished", UnfinishedResponse.serializer())
        assertTrue(unfinished.checkouts.any { it.whatsappLink?.startsWith("https://wa.me/") == true })
        val returns = load("returns", ListSerializer(ReturnRow.serializer()))
        assertTrue(returns.isNotEmpty())
        load("report-sales", SalesReport.serializer())
        load("report-profit", ProfitResponse.serializer())
        load("live-inbox", LiveInboxResponse.serializer())
        load("live-thread", LiveThreadResponse.serializer())
        val team = load("team-home", TeamHome.serializer())
        assertTrue(team.channels.isNotEmpty())
        val messages = load("team-messages", TeamMessagesResponse.serializer())
        assertTrue(messages.messages.isNotEmpty())
    }
}

package com.yallahaul.admin.ui.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.ui.alerts.AlertsScreen
import com.yallahaul.admin.ui.customers.CustomerDetailScreen
import com.yallahaul.admin.ui.customers.CustomersScreen
import com.yallahaul.admin.ui.dashboard.DashboardScreen
import com.yallahaul.admin.ui.discounts.DiscountEditorScreen
import com.yallahaul.admin.ui.discounts.DiscountsScreen
import com.yallahaul.admin.ui.inventory.InventoryScreen
import com.yallahaul.admin.ui.more.MoreScreen
import com.yallahaul.admin.ui.orders.OrderDetailScreen
import com.yallahaul.admin.ui.orders.OrdersScreen
import com.yallahaul.admin.ui.products.ProductEditorScreen
import com.yallahaul.admin.ui.products.ProductsScreen
import com.yallahaul.admin.ui.settings.SettingsScreen

object Routes {
    const val DASHBOARD = "dashboard"
    const val ORDERS = "orders"
    const val PRODUCTS = "products"
    const val INVENTORY = "inventory"
    const val MORE = "more"
    const val CUSTOMERS = "customers"
    const val DISCOUNTS = "discounts"
    const val ALERTS = "alerts"
    const val SETTINGS = "settings"
    fun order(id: String) = "order/$id"
    fun ordersWith(status: String) = "orders-filtered/$status"
    fun inventoryWith(filter: String) = "inventory-filtered/$filter"
    fun product(id: String) = "product/$id"
    fun newProduct() = "product/new"
    fun customer(id: String) = "customer/$id"
    fun discount(id: String) = "discount/$id"

    /** The screen for a path in an alert (the web admin's paths, lib/push.ts on the server). */
    fun fromAlertPath(path: String, user: AppUser): String? {
        val clean = path.substringBefore('?').trimEnd('/')
        val orderId = Regex("^/admin/orders/([A-Za-z0-9_-]{1,64})$").find(clean)?.groupValues?.get(1)
        return when {
            orderId != null && user.can("orders.view") -> order(orderId)
            clean == "/admin/orders" && user.can("orders.view") -> ORDERS
            clean.startsWith("/admin/inventory") && user.can("inventory.view") -> inventoryWith("low")
            clean == "/admin" || clean.isEmpty() -> if (user.can("dashboard.view")) DASHBOARD else ALERTS
            else -> ALERTS
        }
    }
}

@Composable
fun AppNavHost(nav: NavHostController, user: AppUser, padding: PaddingValues, startRoute: String) {
    NavHost(
        navController = nav,
        startDestination = startRoute,
        enterTransition = { fadeIn(tween(220)) + slideInHorizontally(tween(260)) { it / 12 } },
        exitTransition = { fadeOut(tween(180)) },
        popEnterTransition = { fadeIn(tween(220)) },
        popExitTransition = { fadeOut(tween(180)) + slideOutHorizontally(tween(240)) { it / 12 } },
    ) {
        val open: (String) -> Unit = { nav.navigate(it) }
        val back: () -> Unit = { nav.popBackStack() }

        composable(Routes.DASHBOARD) { DashboardScreen(user, padding, open) }
        composable(Routes.ORDERS) { OrdersScreen(padding, open, initialStatus = null, onBack = null) }
        composable("orders-filtered/{status}") { entry -> OrdersScreen(padding, open, initialStatus = entry.arguments?.getString("status"), onBack = back) }
        composable("order/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { OrderDetailScreen(user, back, open) }
        composable(Routes.PRODUCTS) { ProductsScreen(user, padding, open) }
        composable("product/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { ProductEditorScreen(user, back) }
        composable(Routes.INVENTORY) { InventoryScreen(user, padding, initialFilter = null, onBack = null) }
        composable("inventory-filtered/{filter}") { entry -> InventoryScreen(user, padding, initialFilter = entry.arguments?.getString("filter"), onBack = back) }
        composable(Routes.MORE) { MoreScreen(user, padding, open) }
        composable(Routes.CUSTOMERS) { CustomersScreen(back, open) }
        composable("customer/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { CustomerDetailScreen(back, open) }
        composable(Routes.DISCOUNTS) { DiscountsScreen(user, back, open) }
        composable("discount/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { DiscountEditorScreen(back) }
        composable(Routes.ALERTS) { AlertsScreen(user, back, open) }
        composable(Routes.SETTINGS) { SettingsScreen(user, back) }
    }
}

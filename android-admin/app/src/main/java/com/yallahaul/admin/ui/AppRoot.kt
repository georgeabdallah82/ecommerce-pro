package com.yallahaul.admin.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Sell
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.activity.compose.LocalActivity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.session.SessionState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.lock.LockScreen
import com.yallahaul.admin.ui.login.LoginScreen
import com.yallahaul.admin.ui.navigation.AppNavHost
import com.yallahaul.admin.ui.navigation.Routes

private data class TopLevel(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector, val permission: String?)

private val TOP_LEVEL = listOf(
    TopLevel(Routes.DASHBOARD, "Home", Icons.Outlined.Dashboard, Icons.Rounded.Dashboard, "dashboard.view"),
    TopLevel(Routes.ORDERS, "Orders", Icons.AutoMirrored.Outlined.ReceiptLong, Icons.AutoMirrored.Rounded.ReceiptLong, "orders.view"),
    TopLevel(Routes.PRODUCTS, "Products", Icons.Outlined.Sell, Icons.Rounded.Sell, "products.view"),
    TopLevel(Routes.INVENTORY, "Stock", Icons.Outlined.Inventory2, Icons.Rounded.Inventory2, "inventory.view"),
    TopLevel(Routes.MORE, "More", Icons.Outlined.MoreHoriz, Icons.Rounded.MoreHoriz, null),
)

@Composable
fun AppRoot(root: RootViewModel) {
    val session by root.session.collectAsStateWithLifecycle()
    val locked by root.locked.collectAsStateWithLifecycle()
    AnimatedContent(
        targetState = when (val s = session) {
            is SessionState.Loading -> "loading"
            is SessionState.SignedOut -> "login"
            is SessionState.SignedIn -> if (locked) "locked" else "app"
        },
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        label = "root",
    ) { screen ->
        when (screen) {
            "loading" -> LoadingView()
            "login" -> LoginScreen(reason = (session as? SessionState.SignedOut)?.reason)
            "locked" -> LockScreen(onUnlocked = root::unlock)
            else -> (session as? SessionState.SignedIn)?.let { MainShell(it, root) }
        }
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
private fun MainShell(state: SessionState.SignedIn, root: RootViewModel) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val activity = LocalActivity.current ?: return
    val wide = calculateWindowSizeClass(activity).widthSizeClass != WindowWidthSizeClass.Compact
    val items = TOP_LEVEL.filter { it.permission == null || state.user.can(it.permission) }
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val onTopLevel = items.any { item -> backStack?.destination?.hierarchy?.any { it.route == item.route } == true }
    val pendingPath by root.pendingPath.collectAsStateWithLifecycle()

    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { root.notificationsAnswered(it) }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && root.shouldAskForNotifications()) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    LaunchedEffect(pendingPath) {
        val path = pendingPath ?: return@LaunchedEffect
        Routes.fromAlertPath(path, state.user)?.let { nav.navigate(it) { launchSingleTop = true } }
        root.consumePath()
    }

    CompositionLocalProvider(LocalSnackbar provides snackbar, com.yallahaul.admin.ui.components.LocalStore provides state.store) {
        Row(Modifier.fillMaxSize()) {
            if (wide) {
                NavigationRail(containerColor = MaterialTheme.colorScheme.surface, modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                    items.forEach { item -> RailItem(item, currentRoute, nav, backStack?.destination?.hierarchy?.any { it.route == item.route } == true) }
                }
            }
            Scaffold(
                modifier = Modifier.weight(1f),
                snackbarHost = { SnackbarHost(snackbar) },
                contentWindowInsets = WindowInsets(0.dp),
                bottomBar = {
                    if (!wide && onTopLevel) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                            items.forEach { item ->
                                val selected = backStack?.destination?.hierarchy?.any { it.route == item.route } == true
                                NavigationBarItem(
                                    modifier = Modifier.testTag("tab-${item.route}"),
                                    selected = selected,
                                    onClick = { nav.goTopLevel(item.route) },
                                    icon = { Icon(if (selected) item.selectedIcon else item.icon, null) },
                                    label = { Text(item.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedIconColor = MaterialTheme.colorScheme.primary,
                                        selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                    ),
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                Box(Modifier.fillMaxSize()) {
                    AppNavHost(nav, state.user, padding, startRoute = items.first().route)
                }
            }
        }
    }
}

@Composable
private fun RailItem(item: TopLevel, currentRoute: String?, nav: NavHostController, selected: Boolean) {
    NavigationRailItem(
        modifier = Modifier.testTag("tab-${item.route}"),
        selected = selected,
        onClick = { nav.goTopLevel(item.route) },
        icon = { Icon(if (selected) item.selectedIcon else item.icon, null) },
        label = { Text(item.label) },
    )
}

fun NavHostController.goTopLevel(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

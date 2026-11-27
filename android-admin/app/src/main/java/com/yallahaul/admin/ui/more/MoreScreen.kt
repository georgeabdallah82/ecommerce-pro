package com.yallahaul.admin.ui.more

import androidx.core.net.toUri
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Discount
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material.icons.automirrored.outlined.AssignmentReturn
import androidx.compose.material.icons.outlined.RemoveShoppingCart
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.ui.components.Avatar
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.IconBadge
import com.yallahaul.admin.ui.components.ListRow
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.navigation.Routes

@Composable
fun MoreScreen(user: AppUser, padding: PaddingValues, open: (String) -> Unit) {
    val context = LocalContext.current
    val store = LocalStore.current
    Column(Modifier.fillMaxSize().padding(padding)) {
        TopAppBar(title = { Text("More", style = MaterialTheme.typography.headlineSmall) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {

            ConstrainedColumn {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(user.name.ifBlank { user.email }, size = 52.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(user.name, style = MaterialTheme.typography.titleMedium)
                            Text("${Labels.role(user.role)} · ${store.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            ConstrainedColumn {
                SectionCard(contentPadding = PaddingValues(vertical = 6.dp)) {
                    val entries = buildList {
                        if (user.can("reports.view")) add(Triple("Reports", Icons.Outlined.Insights, Routes.REPORTS))
                        if (user.can("customers.view")) add(Triple("Customers", Icons.Outlined.Group, Routes.CUSTOMERS))
                        if (user.can("orders.view")) add(Triple("Drivers", Icons.Outlined.TwoWheeler, Routes.DRIVERS))
                        if (user.can("returns.view")) add(Triple("Returns", Icons.AutoMirrored.Outlined.AssignmentReturn, Routes.RETURNS))
                        if (user.can("abandonedCheckouts.view")) add(Triple("Unfinished checkouts", Icons.Outlined.RemoveShoppingCart, Routes.UNFINISHED))
                        if (user.can("assistant.view")) add(Triple("Live chat", Icons.Outlined.SupportAgent, Routes.LIVE_CHAT))
                        add(Triple("Team chat", Icons.Outlined.Groups, Routes.TEAM_CHAT))
                        if (user.can("reviews.view")) add(Triple("Reviews & questions", Icons.Outlined.RateReview, Routes.REVIEWS))
                        if (user.can("coupons.view")) add(Triple("Discounts", Icons.Outlined.Discount, Routes.DISCOUNTS))
                        add(Triple("Alerts", Icons.Outlined.Notifications, Routes.ALERTS))
                        add(Triple("Settings", Icons.Outlined.Settings, Routes.SETTINGS))
                    }
                    entries.forEachIndexed { index, (label, icon, route) ->
                        if (index > 0) HorizontalDivider(Modifier.padding(start = 70.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        Entry(label, icon) { open(route) }
                    }
                }
            }
            ConstrainedColumn {
                SectionCard(contentPadding = PaddingValues(vertical = 6.dp)) {
                    ListRow(
                        "Open the web admin",
                        subtitle = "Themes, pages, reports and everything else",
                        leading = { IconBadge(Icons.Outlined.OpenInBrowser, Tone.Neutral) },
                        onClick = { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, (BuildConfig.API_BASE_URL + "/admin").toUri()) },
                    )
                }
            }
        }
    }
}

@Composable
private fun Entry(label: String, icon: ImageVector, onClick: () -> Unit) {
    ListRow(label, leading = { IconBadge(icon, Tone.Brand) }, trailing = { Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }, onClick = onClick)
}

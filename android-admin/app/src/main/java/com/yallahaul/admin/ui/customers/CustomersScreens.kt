package com.yallahaul.admin.ui.customers

import com.yallahaul.admin.ui.components.openSafely
import androidx.core.net.toUri
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.CustomerDetail
import com.yallahaul.admin.core.model.CustomerRow
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.Avatar
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadMoreEffect
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SearchField
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.orderTone
import com.yallahaul.admin.ui.navigation.Routes

@Composable
fun CustomersScreen(onBack: () -> Unit, open: (String) -> Unit, vm: CustomersViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val currency = LocalStore.current.currency
    LoadMoreEffect(listState, enabled = state.list.canLoadMore && !state.loading) { vm.loadMore() }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Customers") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        ConstrainedColumn { SearchField(state.query, vm::setQuery, "Search name, email or phone", Modifier.padding(horizontal = 16.dp).padding(bottom = 10.dp)) }
        when {
            state.loading && state.list.rows.isEmpty() -> LoadingView()
            state.error != null && state.list.rows.isEmpty() -> ErrorView(state.error!!, vm::refresh)
            else -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.list.rows.isEmpty()) item {
                        if (state.query.isNotBlank()) EmptyView("No customers match \"${state.query}\"", null, Icons.Outlined.SearchOff)
                        else EmptyView("No customer accounts yet", "Guests who order without an account show on their orders.", Icons.Outlined.Group)
                    } else item {
                        Text("${state.list.total} customer${if (state.list.total == 1) "" else "s"} · ${state.active} active", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(state.list.rows, key = { it.id }) { c -> ConstrainedColumn { CustomerCard(c, currency) { open(Routes.customer(c.id)) } } }
                    item {
                        if (state.list.loadingMore) Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
                        else if (state.list.moreError != null) TextButton(onClick = vm::loadMore) { Text("Couldn't load more · Retry") }
                    }
                }
            }
        }
    }
}

@Composable
private fun CustomerCard(c: CustomerRow, currency: String, onClick: () -> Unit) {
    Surface(Modifier.fillMaxWidth().clickable(onClick = onClick), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(c.name.ifBlank { c.email })
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(c.name.ifBlank { c.email }, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(c.phone, c.email.takeIf { !it.endsWith("@phone.local") }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!c.isActive || c.tags.isNotEmpty()) Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!c.isActive) Pill("Disabled", Tone.Danger)
                    c.tags.take(2).forEach { Pill(it.value, Tone.Neutral) }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Money.format(c.totalSpent, currency), style = MaterialTheme.typography.titleSmall)
                Text("${c.counts.orders} order${if (c.counts.orders == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun CustomerDetailScreen(onBack: () -> Unit, open: (String) -> Unit, vm: CustomerDetailViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text((state as? LoadState.Ready)?.data?.name ?: "Customer", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, vm::load)
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load, modifier = Modifier.fillMaxSize()) {
                CustomerContent(s.data, open)
            }
        }
    }
}

@Composable
private fun CustomerContent(c: CustomerDetail, open: (String) -> Unit) {
    val context = LocalContext.current
    val currency = c.orders.firstOrNull()?.currency ?: LocalStore.current.currency
    val countable = c.orders.count { it.status != "CANCELLED" }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            ConstrainedColumn {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(c.name.ifBlank { c.email }, size = 56.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.name.ifBlank { "No name" }, style = MaterialTheme.typography.titleLarge)
                            Text("Customer since ${Dates.date(c.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!c.isActive) Pill("Account disabled", Tone.Danger, Modifier.padding(top = 6.dp))
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        c.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                            Contact(Icons.Outlined.Call, "Call") { context.openSafely(Intent(Intent.ACTION_DIAL, "tel:$phone".toUri())) }
                            Contact(Icons.AutoMirrored.Outlined.Chat, "WhatsApp") { context.openSafely(Intent(Intent.ACTION_VIEW, "https://wa.me/${phone.filter(Char::isDigit)}".toUri())) }
                        }
                        if (c.email.isNotBlank() && !c.email.endsWith("@phone.local")) Contact(Icons.Outlined.Email, "Email") { context.openSafely(Intent(Intent.ACTION_SENDTO, "mailto:${c.email}".toUri())) }
                    }
                }
            }
        }
        item {
            ConstrainedColumn {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Stat("Total spent", Money.format(c.orderTotal, currency), Modifier.weight(1f))
                    Stat("Orders", c.counts.orders.toString(), Modifier.weight(1f))
                    Stat("Average", if (countable > 0) Money.format(c.orderTotal / countable, currency) else "—", Modifier.weight(1f))
                }
            }
        }
        item {
            ConstrainedColumn {
                SectionCard(title = "Contact") {
                    com.yallahaul.admin.ui.components.LabeledValue("Email", c.email)
                    c.phone?.let { com.yallahaul.admin.ui.components.LabeledValue("Phone", it) }
                    c.lastLoginAt?.let { com.yallahaul.admin.ui.components.LabeledValue("Last signed in", Dates.relative(it)) }
                }
            }
        }
        if (c.addresses.isNotEmpty()) item {
            ConstrainedColumn {
                SectionCard(title = "Addresses") {
                    c.addresses.forEachIndexed { index, a ->
                        if (index > 0) HorizontalDivider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        Row {
                            Icon(Icons.Outlined.Place, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text("${a.firstName} ${a.lastName}".trim() + if (a.isDefault) " · Default" else "", style = MaterialTheme.typography.titleSmall)
                                Text(listOfNotNull(a.line1, a.line2, a.city, a.region, a.country).filter { it.isNotBlank() }.joinToString(", "), style = MaterialTheme.typography.bodyMedium)
                                a.phone?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                        }
                    }
                }
            }
        }
        item {
            ConstrainedColumn {
                SectionCard(title = "Orders", contentPadding = PaddingValues(top = 16.dp, bottom = 4.dp)) {
                    if (c.orders.isEmpty()) Text("No orders yet.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    c.orders.forEachIndexed { index, o ->
                        if (index > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        Row(Modifier.fillMaxWidth().clickable { open(Routes.order(o.id)) }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("#${o.orderNumber}", style = MaterialTheme.typography.titleSmall)
                                Text("${Dates.date(o.createdAt)} · ${o.items.sumOf { it.quantity }} items", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(Money.format(o.grandTotal, o.currency), style = MaterialTheme.typography.titleSmall)
                                Pill(Labels.orderStatus(o.status), orderTone(o.status))
                            }
                            Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(14.dp)) {
            Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Contact(icon: ImageVector, label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(14.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)) {
        Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(label)
    }
}

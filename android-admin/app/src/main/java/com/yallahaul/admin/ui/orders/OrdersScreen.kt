package com.yallahaul.admin.ui.orders

import androidx.compose.foundation.clickable
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.yallahaul.admin.ui.components.ConfirmDialog
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.OrderRow
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import androidx.compose.ui.platform.testTag
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadMoreEffect
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SearchField
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.orderTone
import com.yallahaul.admin.ui.components.paymentTone
import com.yallahaul.admin.ui.navigation.Routes
import org.json.JSONObject

private val FILTERS = listOf(
    null to "All",
    "PENDING" to "Pending",
    "CONFIRMED,PROCESSING" to "To prepare",
    "SHIPPED" to "Out for delivery",
    "DELIVERED" to "Delivered",
    "CANCELLED" to "Cancelled",
)

@Composable
fun OrdersScreen(padding: PaddingValues, open: (String) -> Unit, initialStatus: String?, onBack: (() -> Unit)?, canManage: Boolean = false, vm: OrdersViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val working by vm.working.collectAsStateWithLifecycle()
    val drivers by vm.drivers.collectAsStateWithLifecycle()
    val snackbar = com.yallahaul.admin.ui.components.LocalSnackbar.current
    var confirmBulk by remember { mutableStateOf(false) }
    var pickDriver by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LoadMoreEffect(listState, enabled = state.list.canLoadMore && !state.loading) { vm.loadMore() }
    BackHandler(enabled = selected.isNotEmpty()) { vm.clearSelection() }
    Box(Modifier.fillMaxSize().padding(padding)) {
    Column(Modifier.fillMaxSize()) {
        if (selected.isNotEmpty()) TopAppBar(
            title = { Text("${selected.size} selected") },
            navigationIcon = { IconButton(onClick = vm::clearSelection) { Icon(Icons.Rounded.Close, "Clear selection") } },
            actions = {
                TextButton(onClick = { confirmBulk = true }, enabled = !working) { Text("Confirm") }
                TextButton(onClick = { vm.loadDrivers(); pickDriver = true }, enabled = !working) { Text("Driver") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        ) else TopAppBar(
            title = { Text("Orders", style = MaterialTheme.typography.headlineSmall) },
            navigationIcon = { if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        ConstrainedColumn {
            SearchField(state.query, vm::setQuery, "Search number, name, phone, city", Modifier.padding(horizontal = 16.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FILTERS.forEach { (value, label) ->
                    val count = when (value) {
                        null -> state.counts.values.sum()
                        else -> value.split(',').sumOf { state.counts[it] ?: 0 }
                    }
                    FilterChip(
                        selected = state.status == value,
                        onClick = { vm.setStatus(value) },
                        label = { Text(if (state.counts.isNotEmpty()) "$label  $count" else label) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MaterialTheme.colorScheme.primaryContainer, selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer),
                    )
                }
            }
        }
        OfflineBanner(state.list.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::refresh)
        when {
            state.loading && state.list.rows.isEmpty() -> LoadingView()
            state.error != null && state.list.rows.isEmpty() -> ErrorView(state.error!!, onRetry = vm::refresh)
            else -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                if (state.list.rows.isEmpty()) {
                    LazyColumn(Modifier.fillMaxSize()) {
                        item {
                            if (state.query.isNotBlank()) EmptyView("No orders match \"${state.query}\"", "Try a different number, name or phone.", Icons.Outlined.SearchOff)
                            else EmptyView("No orders here yet", "New orders from the store appear here the moment they're placed.", Icons.AutoMirrored.Outlined.ReceiptLong)
                        }
                    }
                } else {
                    LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item { Text("${state.list.total} order${if (state.list.total == 1) "" else "s"}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        if (canManage && selected.isEmpty()) item { Text("Tip: press and hold an order to select several.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        items(state.list.rows, key = { it.id }) { order ->
                            ConstrainedColumn {
                                OrderCard(
                                    order, isSelected = order.id in selected,
                                    onClick = { if (selected.isNotEmpty()) vm.toggle(order.id) else open(Routes.order(order.id)) },
                                    onLongClick = { if (canManage) vm.toggle(order.id) },
                                )
                            }
                        }
                        item {
                            when {
                                state.list.loadingMore -> Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
                                state.list.moreError != null -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { TextButton(onClick = vm::loadMore) { Text("Couldn't load more · Retry") } }
                            }
                        }
                    }
                }
            }
        }
    }
    if (canManage && selected.isEmpty()) ExtendedFloatingActionButton(
        onClick = { open(Routes.NEW_ORDER) }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("New order") },
        modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).testTag("new-order"),
        containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
    )
    }
    if (confirmBulk) ConfirmDialog(
        title = "Confirm ${selected.size} order${if (selected.size == 1) "" else "s"}?",
        body = "Every selected order that is still pending moves to Confirmed and each customer is updated. Orders in other steps are left as they are.",
        confirmLabel = "Confirm orders", onConfirm = vm::confirmSelected, onDismiss = { confirmBulk = false },
    )
    if (pickDriver) AlertDialog(
        onDismissRequest = { pickDriver = false },
        title = { Text("Give to a driver") },
        text = {
            Column {
                if (drivers.isEmpty()) Text("No active drivers. Add them in More › Drivers.")
                drivers.forEach { d ->
                    Row(Modifier.fillMaxWidth().clickable { vm.assignSelected(d.id); pickDriver = false }.padding(vertical = 12.dp)) {
                        Text(d.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Text("${d.out.size} on the way", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { pickDriver = false }) { Text("Cancel") } },
    )
}

internal fun guestName(order: OrderRow): String {
    order.user?.name?.takeIf { it.isNotBlank() }?.let { return it }
    val address = runCatching { JSONObject(order.shippingAddressJson ?: "{}") }.getOrNull()
    val name = listOfNotNull(address?.optString("firstName")?.takeIf { it.isNotBlank() }, address?.optString("lastName")?.takeIf { it.isNotBlank() }).joinToString(" ")
    return name.ifBlank { address?.optString("name")?.takeIf { it.isNotBlank() } ?: order.email?.takeIf { it.isNotBlank() } ?: order.phone ?: "Guest" }
}

internal fun cityOf(order: OrderRow): String? = runCatching { JSONObject(order.shippingAddressJson ?: "{}").optString("city").takeIf { it.isNotBlank() } }.getOrNull()

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun OrderCard(order: OrderRow, isSelected: Boolean = false, onClick: () -> Unit, onLongClick: () -> Unit = {}) {
    Surface(
        Modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = onLongClick),
        shape = MaterialTheme.shapes.large,
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("#${order.orderNumber}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(Money.format(order.grandTotal, order.currency), style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    listOfNotNull(guestName(order), cityOf(order)).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                Text(Dates.relative(order.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val items = order.items.sumOf { it.quantity }
            if (order.items.isNotEmpty()) {
                Text(
                    "$items item${if (items == 1) "" else "s"} · " + order.items.take(2).joinToString(", ") { it.name } + if (order.items.size > 2) " +${order.items.size - 2}" else "",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill(Labels.orderStatus(order.status), orderTone(order.status))
                Pill(Labels.paymentStatus(order.paymentStatus), paymentTone(order.paymentStatus))
                if (order.risk != null) Pill(if (order.risk.level == "high") "High risk" else "Check first", if (order.risk.level == "high") Tone.Danger else Tone.Warning, icon = Icons.Outlined.ReportProblem)
                Spacer(Modifier.weight(1f))
                Text(Labels.paymentMethod(order.paymentMethod), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 120.dp))
            }
        }
    }
}


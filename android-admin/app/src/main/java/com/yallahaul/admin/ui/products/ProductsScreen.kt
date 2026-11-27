package com.yallahaul.admin.ui.products

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.rounded.Close
import androidx.activity.compose.BackHandler
import kotlinx.coroutines.launch
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.ProductRow
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadMoreEffect
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SearchField
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.productTone
import com.yallahaul.admin.ui.components.stockTone
import com.yallahaul.admin.ui.navigation.Routes

private val TABS = listOf("ALL" to "All", "ACTIVE" to "Active", "DRAFT" to "Draft", "ARCHIVED" to "Archived")

@Composable
fun ProductsScreen(user: AppUser, padding: PaddingValues, open: (String) -> Unit, vm: ProductsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val listState = rememberLazyListState()
    val canManage = user.can("products.manage")
    var confirm by remember { mutableStateOf<ProductRow?>(null) }
    var confirmArchive by remember { mutableStateOf(false) }
    val selected by vm.selected.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(Unit) { vm.found.collect { id -> open(Routes.product(id)) } }
    BackHandler(enabled = selected.isNotEmpty()) { vm.clearSelection() }
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val scan: () -> Unit = {
        scope.launch {
            when (val r = com.yallahaul.admin.core.scan.BarcodeScanner.scan(context)) {
                is com.yallahaul.admin.core.scan.BarcodeScanner.Result.Code -> vm.findCode(r.value)
                is com.yallahaul.admin.core.scan.BarcodeScanner.Result.Unavailable -> snackbar.showSnackbar(r.message)
                else -> Unit
            }
        }
    }
    LoadMoreEffect(listState, enabled = state.list.canLoadMore && !state.loading) { vm.loadMore() }

    Box(Modifier.fillMaxSize().padding(padding)) {
        Column(Modifier.fillMaxSize()) {
            if (selected.isNotEmpty()) TopAppBar(
                title = { Text("${selected.size} selected") },
                navigationIcon = { IconButton(onClick = vm::clearSelection) { Icon(Icons.Rounded.Close, "Clear selection") } },
                actions = {
                    var menu by remember { mutableStateOf(false) }
                    TextButton(onClick = { vm.bulk("ACTIVE", "now live in the shop") }) { Text("Activate") }
                    TextButton(onClick = { vm.bulk("DRAFT", "hidden from the shop") }) { Text("Hide") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "More actions") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("Feature on home page") }, onClick = { menu = false; vm.bulk("FEATURED_ON", "featured") })
                            DropdownMenuItem(text = { Text("Remove from featured") }, onClick = { menu = false; vm.bulk("FEATURED_OFF", "no longer featured") })
                            DropdownMenuItem(text = { Text("Archive") }, onClick = { menu = false; confirmArchive = true })
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            ) else TopAppBar(
                title = { Text("Products", style = MaterialTheme.typography.headlineSmall) },
                actions = { IconButton(onClick = scan) { Icon(Icons.Outlined.QrCodeScanner, "Scan a barcode") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
            ConstrainedColumn {
                SearchField(state.query, vm::setQuery, "Search name, SKU, brand", Modifier.padding(horizontal = 16.dp))
                PrimaryScrollableTabRow(selectedTabIndex = TABS.indexOfFirst { it.first == state.status }.coerceAtLeast(0), edgePadding = 12.dp, containerColor = MaterialTheme.colorScheme.background, divider = {}) {
                    TABS.forEach { (value, label) ->
                        val count = state.counts[value]
                        Tab(selected = state.status == value, onClick = { vm.setStatus(value) }, text = { Text(if (count != null) "$label · $count" else label) })
                    }
                }
            }
            OfflineBanner(state.list.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::refresh)
            when {
                state.loading && state.list.rows.isEmpty() -> LoadingView()
                state.error != null && state.list.rows.isEmpty() -> ErrorView(state.error!!, vm::refresh)
                else -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (state.list.rows.isEmpty()) item {
                            if (state.query.isNotBlank()) EmptyView("Nothing matches \"${state.query}\"", "Try another name or SKU.", Icons.Outlined.SearchOff)
                            else EmptyView("No products here", if (canManage) "Add your first product with the button below." else null, Icons.Outlined.Sell)
                        }
                        items(state.list.rows, key = { it.id }) { product ->
                            ConstrainedColumn {
                                ProductCard(
                                    product, canManage, isSelected = product.id in selected,
                                    onOpen = { if (selected.isNotEmpty()) vm.toggle(product.id) else open(Routes.product(product.id)) },
                                    onToggle = { confirm = product },
                                    onSelect = { if (canManage) vm.toggle(product.id) },
                                )
                            }
                        }
                        item {
                            if (state.list.loadingMore) Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
                            else if (state.list.moreError != null) TextButton(onClick = vm::loadMore) { Text("Couldn't load more · Retry") }
                        }
                    }
                }
            }
        }
        if (canManage && selected.isEmpty()) ExtendedFloatingActionButton(
            onClick = { open(Routes.newProduct()) },
            icon = { Icon(Icons.Rounded.Add, null) },
            text = { Text("Add product") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).testTag("add-product"),
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        )
    }

    if (confirmArchive) ConfirmDialog(
        title = "Archive ${selected.size} product${if (selected.size == 1) "" else "s"}?",
        body = "They're hidden from the shop and moved out of the way. Past orders keep them, and you can activate them again later.",
        confirmLabel = "Archive", destructive = true,
        onConfirm = { vm.bulk("ARCHIVED", "archived") }, onDismiss = { confirmArchive = false },
    )
    confirm?.let { product ->
        val activating = product.status != "ACTIVE"
        ConfirmDialog(
            title = if (activating) "Show \"${product.name}\" in the shop?" else "Hide \"${product.name}\" from the shop?",
            body = if (activating) "Shoppers will be able to find and buy it. If it's sold out it shows with a \"Sold out\" label, as usual."
            else "It moves to Draft: shoppers can't see or buy it until you activate it again. Its orders and stock are kept.",
            confirmLabel = if (activating) "Activate" else "Hide",
            onConfirm = { vm.toggleActive(product) },
            onDismiss = { confirm = null },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ProductCard(product: ProductRow, canManage: Boolean, isSelected: Boolean = false, onOpen: () -> Unit, onToggle: () -> Unit, onSelect: () -> Unit = {}) {
    var menu by remember { mutableStateOf(false) }
    val currency = LocalStore.current.currency
    val units = product.available()
    val stock = product.stockState()
    Surface(
        Modifier.fillMaxWidth().combinedClickable(onClick = onOpen, onLongClick = onSelect),
        shape = MaterialTheme.shapes.large,
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RemoteImage(product.images.firstOrNull()?.url, product.name, size = 72.dp, shape = MaterialTheme.shapes.medium)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(product.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (product.featured) { Spacer(Modifier.width(4.dp)); Icon(Icons.Outlined.Star, "Featured", tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(16.dp)) }
                }
                Text("SKU ${product.sku}" + if (product.variants.size > 1) " · ${product.variants.size} options" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(Money.format(product.basePrice, currency), style = MaterialTheme.typography.titleSmall)
                    product.compareAtPrice?.takeIf { it > product.basePrice }?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(Money.format(it, currency), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textDecoration = TextDecoration.LineThrough)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill(Labels.productStatus(product.status), productTone(product.status))
                    when {
                        units == null -> Pill("Not tracked", Tone.Neutral)
                        stock == "out" && (product.continueSellingWhenOutOfStock || product.preorder) -> Pill(if (product.preorder) "Pre-order" else "Selling at 0", Tone.Info)
                        stock == "out" -> Pill("Sold out", stockTone(stock))
                        else -> Pill("$units in stock", stockTone(stock))
                    }
                }
            }
            if (canManage) Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "Actions") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text(if (product.status == "ACTIVE") "Hide from shop (draft)" else "Activate in shop") },
                        leadingIcon = { Icon(if (product.status == "ACTIVE") Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, null) },
                        onClick = { menu = false; onToggle() },
                    )
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { menu = false; onOpen() })
                }
            }
        }
    }
}

package com.yallahaul.admin.ui.inventory

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.QrCodeScanner
import kotlinx.coroutines.launch
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.StockItem
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadMoreEffect
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SearchField
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.stockTone
import com.yallahaul.admin.ui.theme.AppTheme

private val FILTERS = listOf("all" to "All", "low" to "Running low", "out" to "Sold out", "in" to "In stock")
private val REASONS = listOf("Received stock", "Stock count correction", "Returned by customer", "Damaged or lost")

@Composable
fun InventoryScreen(user: AppUser, padding: PaddingValues, initialFilter: String?, onBack: (() -> Unit)?, vm: InventoryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val listState = rememberLazyListState()
    var editing by remember { mutableStateOf<StockItem?>(null) }
    val canManage = user.can("inventory.manage")
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(Unit) { vm.adjusted.collect { id -> if (editing?.id == id) editing = null } }
    LaunchedEffect(Unit) { vm.scanned.collect { item -> if (canManage) editing = item else snackbar.showSnackbar("${item.name}: ${item.available} available") } }
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

    Column(Modifier.fillMaxSize().padding(padding)) {
        TopAppBar(
            title = { Text("Stock", style = MaterialTheme.typography.headlineSmall) },
            navigationIcon = { if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = { IconButton(onClick = scan) { Icon(Icons.Outlined.QrCodeScanner, "Scan a barcode") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        ConstrainedColumn {
            Row(Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SummaryTile("Units", state.summary.units.toString(), Tone.Neutral, Modifier.weight(1f))
                SummaryTile("Running low", state.summary.low.toString(), Tone.Warning, Modifier.weight(1f)) { vm.setFilter("low") }
                SummaryTile("Sold out", state.summary.out.toString(), Tone.Danger, Modifier.weight(1f)) { vm.setFilter("out") }
            }
            SearchField(state.query, vm::setQuery, "Search product, SKU or barcode", Modifier.padding(horizontal = 16.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FILTERS.forEach { (value, label) ->
                    FilterChip(
                        selected = state.filter == value, onClick = { vm.setFilter(value) }, label = { Text(label) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MaterialTheme.colorScheme.primaryContainer, selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer),
                    )
                }
            }
        }
        OfflineBanner(state.list.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::refresh)
        when {
            state.loading && state.list.rows.isEmpty() -> LoadingView()
            state.error != null && state.list.rows.isEmpty() -> ErrorView(state.error!!, vm::refresh)
            else -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(state = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.list.rows.isEmpty()) item {
                        if (state.query.isNotBlank()) EmptyView("Nothing matches \"${state.query}\"", null, Icons.Outlined.SearchOff)
                        else EmptyView(if (state.filter == "all") "No stock to show" else "Nothing ${FILTERS.first { it.first == state.filter }.second.lowercase()}", "Good news if you were looking for problems.", Icons.Outlined.Inventory2)
                    }
                    items(state.list.rows, key = { it.id }) { item -> ConstrainedColumn { StockRow(item) { if (canManage) editing = item } } }
                    item {
                        if (state.list.loadingMore) Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
                        else if (state.list.moreError != null) TextButton(onClick = vm::loadMore) { Text("Couldn't load more · Retry") }
                    }
                }
            }
        }
    }
    editing?.let { item -> AdjustSheet(item, state.saving, onDismiss = { editing = null }, onSave = { delta, reason, damage, threshold -> vm.adjust(item, delta, reason, damage && delta < 0, threshold) }) }
}

@Composable
private fun SummaryTile(label: String, value: String, tone: Tone, modifier: Modifier, onClick: (() -> Unit)? = null) {
    val (bg, fg) = com.yallahaul.admin.ui.components.toneColors(tone)
    Surface(modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier), shape = MaterialTheme.shapes.medium, color = bg.copy(alpha = 0.6f)) {
        Column(Modifier.padding(12.dp)) {
            Text(value, style = MaterialTheme.typography.titleLarge, color = fg, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StockRow(item: StockItem, onClick: () -> Unit) {
    Surface(Modifier.fillMaxWidth().clickable(onClick = onClick), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RemoteImage(item.imageUrl, item.name, size = 52.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(item.variant, item.sku.takeIf { it.isNotBlank() }, item.location).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill(when (item.state) { "out" -> "Sold out"; "low" -> "Running low"; else -> "In stock" }, stockTone(item.state))
                    if (item.reserved > 0) Pill("${item.reserved} reserved", Tone.Info)
                    if (item.state == "out" && item.sellsWhenOut) Pill("Still selling", Tone.Neutral)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(item.available.toString(), style = MaterialTheme.typography.headlineSmall, color = when (item.state) { "out" -> AppTheme.status.danger; "low" -> AppTheme.status.warning; else -> MaterialTheme.colorScheme.onSurface })
                Text("available", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AdjustSheet(item: StockItem, saving: Boolean, onDismiss: () -> Unit, onSave: (Int, String, Boolean, Int?) -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var target by remember(item.id) { mutableIntStateOf(item.quantity) }
    var targetText by remember(item.id) { mutableStateOf(item.quantity.toString()) }
    var reason by remember(item.id) { mutableStateOf(REASONS.first()) }
    var thresholdText by remember(item.id) { mutableStateOf(item.lowStockThreshold.toString()) }
    val delta = target - item.quantity
    val damage = reason == REASONS.last()
    val belowReserved = target < item.reserved
    val damageWrongWay = damage && delta > 0
    fun set(value: Int) { target = value.coerceIn(0, 1_000_000); targetText = target.toString() }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 16.dp).navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RemoteImage(item.imageUrl, item.name, size = 48.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(item.variant, item.location).joinToString(" · ").ifBlank { "SKU ${item.sku}" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(20.dp))
            Text("On hand", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                FilledTonalIconButton(onClick = { set(target - 1) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Rounded.Remove, "One less") }
                OutlinedTextField(
                    value = targetText,
                    onValueChange = { v -> targetText = v.filter(Char::isDigit).take(7); targetText.toIntOrNull()?.let { target = it } },
                    modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                    textStyle = MaterialTheme.typography.headlineMedium.copy(textAlign = TextAlign.Center),
                    singleLine = true, shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                FilledTonalIconButton(onClick = { set(target + 1) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Rounded.Add, "One more") }
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(5, 10, 25, 50).forEach { n -> FilterChip(selected = false, onClick = { set(target + n) }, label = { Text("+$n") }) }
            }
            Text(
                when {
                    delta > 0 -> "Adding $delta · ${target - item.reserved} will be available"
                    delta < 0 -> "Removing ${-delta} · ${target - item.reserved} will be available"
                    else -> "${item.reserved} reserved for open orders · ${item.available} available"
                },
                style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp),
                color = if (belowReserved) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (belowReserved) Text("Open orders have ${item.reserved} reserved, so stock can't go below that.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)

            Spacer(Modifier.height(16.dp))
            Text("Reason", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                REASONS.forEach { r -> FilterChip(selected = reason == r, onClick = { reason = r }, label = { Text(r) }) }
            }
            if (damageWrongWay) Text("Damaged or lost stock can only lower the count.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = thresholdText, onValueChange = { thresholdText = it.filter(Char::isDigit).take(6) },
                label = { Text("Alert me when available stock is at or below") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )

            if (item.movements.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text("Recent changes", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                item.movements.take(4).forEach { m ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(m.reason ?: Labels.movement(m.type), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(Dates.relative(m.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text((if (m.quantity > 0) "+" else "") + m.quantity, style = MaterialTheme.typography.titleSmall, color = if (m.quantity >= 0) AppTheme.status.success else AppTheme.status.danger)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }

            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { onSave(delta, reason, damage, thresholdText.toIntOrNull()) },
                enabled = !saving && !belowReserved && !damageWrongWay && targetText.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp),
            ) {
                if (saving) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                else Text(if (delta == 0) "Save" else "Save stock change", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

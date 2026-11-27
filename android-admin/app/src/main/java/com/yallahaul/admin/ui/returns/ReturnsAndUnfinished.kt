package com.yallahaul.admin.ui.returns

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.AssignmentReturn
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.RemoveShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ReturnsRepository
import com.yallahaul.admin.core.data.UnfinishedRepository
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.ReturnRow
import com.yallahaul.admin.core.model.UnfinishedRow
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.openSafely
import com.yallahaul.admin.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private val RETURN_FILTERS = listOf(null to "All", "REQUESTED" to "Requested", "APPROVED" to "Approved", "RECEIVED" to "Received", "REFUNDED" to "Refunded")

@HiltViewModel
class ReturnsViewModel @Inject constructor(private val repo: ReturnsRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<ReturnRow>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<ReturnRow>>> = _state.asStateFlow()
    private val _filter = MutableStateFlow<String?>(null)
    val filter: StateFlow<String?> = _filter.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun setFilter(status: String?) { _filter.value = status; load() }

    fun load() = viewModelScope.launch {
        (_state.value as? LoadState.Ready)?.let { _state.value = it.copy(refreshing = true) }
        _state.value = when (val r = repo.list(_filter.value)) { is ApiResult.Success -> LoadState.Ready(r.data); is ApiResult.Failure -> LoadState.Failed(r.error) }
    }

    /** Approve, reject or mark received (items back in stock if the return said so), through the web's return route. */
    fun act(row: ReturnRow, action: String, done: String) = viewModelScope.launch {
        when (val r = repo.act(row.id, action)) {
            is ApiResult.Success -> { _messages.send(done); load() }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
    }
}

@Composable
fun ReturnsScreen(user: AppUser, onBack: () -> Unit, open: (String) -> Unit, vm: ReturnsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val canManage = user.can("returns.manage")
    var confirm by remember { mutableStateOf<Triple<ReturnRow, String, String>?>(null) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Returns") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RETURN_FILTERS.forEach { (value, label) -> FilterChip(selected = filter == value, onClick = { vm.setFilter(value) }, label = { Text(label) }) }
        }
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, { vm.load() })
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (s.data.isEmpty()) item { EmptyView("No returns", "Record a return from its order: open the order, then Returns and refunds.", Icons.AutoMirrored.Outlined.AssignmentReturn) }
                    items(s.data, key = { it.id }) { r ->
                        val currency = r.order?.currency ?: "USD"
                        ConstrainedColumn {
                            SectionCard(modifier = Modifier.clickable { r.order?.id?.let { open(Routes.order(it)) } }) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("Order #${r.order?.orderNumber ?: "?"}", style = MaterialTheme.typography.titleSmall)
                                        Text("${Dates.relative(r.createdAt)} · ${r.items.sumOf { it.quantity }} item${if (r.items.sumOf { it.quantity } == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Pill(r.status.lowercase().replaceFirstChar { it.uppercase() }, when (r.status) { "REQUESTED" -> Tone.Warning; "APPROVED" -> Tone.Info; "RECEIVED", "REFUNDED" -> Tone.Success; else -> Tone.Neutral })
                                }
                                Text(r.reason, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                                val names = r.items.mapNotNull { item -> r.order?.items?.firstOrNull { it.id == item.orderItemId }?.name?.let { "${item.quantity} × $it" } }
                                if (names.isNotEmpty()) Text(names.joinToString(", "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (r.refundAmount > 0) Text("Refund ${Money.format(r.refundAmount, currency)}", style = MaterialTheme.typography.bodySmall)
                                if (canManage && r.status in setOf("REQUESTED", "APPROVED")) {
                                    Spacer(Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TextButton(onClick = { confirm = Triple(r, "reject", "Return declined") }) { Text("Decline") }
                                        if (r.status == "REQUESTED") OutlinedButton(onClick = { confirm = Triple(r, "approve", "Return approved") }, shape = RoundedCornerShape(12.dp)) { Text("Approve") }
                                        Button(onClick = { confirm = Triple(r, "receive", "Marked as received") }, shape = RoundedCornerShape(12.dp)) { Text("Received") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    confirm?.let { (row, action, done) ->
        val (title, body) = when (action) {
            "approve" -> "Approve this return?" to "The customer is told to send the items back."
            "reject" -> "Decline this return?" to "The customer is told it was declined."
            else -> "Items received?" to (if (row.restock) "The items go back in stock and the customer is told." else "The customer is told the items arrived. Stock isn't changed (this return doesn't restock).")
        }
        ConfirmDialog(title, body, if (action == "reject") "Decline" else "Yes", destructive = action == "reject", onConfirm = { vm.act(row, action, done) }, onDismiss = { confirm = null })
    }
}

@HiltViewModel
class UnfinishedViewModel @Inject constructor(private val repo: UnfinishedRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<UnfinishedRow>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<UnfinishedRow>>> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() = viewModelScope.launch {
        (_state.value as? LoadState.Ready)?.let { _state.value = it.copy(refreshing = true) }
        _state.value = when (val r = repo.list()) { is ApiResult.Success -> LoadState.Ready(r.data.checkouts); is ApiResult.Failure -> LoadState.Failed(r.error) }
    }

    fun whatsappOpened(row: UnfinishedRow) = viewModelScope.launch { repo.whatsappOpened(row.id); load() }

    fun dismiss(row: UnfinishedRow) = viewModelScope.launch {
        when (val r = repo.dismiss(row.id)) {
            is ApiResult.Success -> { _messages.send("Removed from the list"); load() }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
    }
}

@Composable
fun UnfinishedScreen(user: AppUser, onBack: () -> Unit, vm: UnfinishedViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val context = LocalContext.current
    val canManage = user.can("abandonedCheckouts.manage")
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Unfinished checkouts") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, { vm.load() })
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { Text("Shoppers who started checkout and left. A friendly WhatsApp often brings the order back.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (s.data.isEmpty()) item { EmptyView("Nothing unfinished", "When a shopper leaves checkout, they show up here.", Icons.Outlined.RemoveShoppingCart) }
                    items(s.data, key = { it.id }) { row ->
                        ConstrainedColumn {
                            SectionCard {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(row.name ?: row.phone ?: row.email ?: "Shopper", style = MaterialTheme.typography.titleSmall)
                                        Text(listOfNotNull(row.phone, row.place, "left ${Dates.relative(row.lastActivity).lowercase()}").joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text(Money.format(row.subtotal, row.currency), style = MaterialTheme.typography.titleSmall)
                                }
                                Text(row.lines.take(4).joinToString(", ") { "${it.quantity} × ${it.name}" } + if (row.lines.size > 4) " +${row.lines.size - 4}" else "", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    if (row.whatsappAt != null) Pill("WhatsApp sent ${Dates.relative(row.whatsappAt).lowercase()}", Tone.Success)
                                    if (row.emailSent) Pill("Reminder email sent", Tone.Info)
                                }
                                if (canManage) Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    TextButton(onClick = { vm.dismiss(row) }) { Text("Remove") }
                                    Spacer(Modifier.weight(1f))
                                    row.whatsappLink?.let { link ->
                                        Button(onClick = { context.openSafely(Intent(Intent.ACTION_VIEW, link.toUri())); vm.whatsappOpened(row) }, shape = RoundedCornerShape(12.dp)) {
                                            Icon(Icons.AutoMirrored.Outlined.Chat, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                                            Text(if (row.whatsappAt != null) "Message again" else "Remind on WhatsApp")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

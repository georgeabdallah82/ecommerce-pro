package com.yallahaul.admin.ui.alerts

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.AlertsRepository
import com.yallahaul.admin.core.model.AlertItem
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.IconBadge
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AlertsViewModel @Inject constructor(private val repo: AlertsRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<AlertItem>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<AlertItem>>> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        (_state.value as? LoadState.Ready)?.let { _state.value = it.copy(refreshing = true) }
        viewModelScope.launch {
            _state.value = when (val r = repo.list()) {
                is ApiResult.Success -> LoadState.Ready(r.data.items, offlineSince = r.cachedAt)
                is ApiResult.Failure -> (_state.value as? LoadState.Ready)?.copy(refreshing = false, refreshError = r.error.message) ?: LoadState.Failed(r.error)
            }
        }
    }

    fun opened(item: AlertItem) {
        if (item.read) return
        update { list -> list.map { if (it.id == item.id) it.copy(read = true) else it } }
        viewModelScope.launch { repo.markRead(listOf(item.id)) }
    }

    fun markAllRead() {
        update { list -> list.map { it.copy(read = true) } }
        viewModelScope.launch { if (repo.markAllRead() is ApiResult.Failure) _messages.send("Couldn't mark them read. Try again.") }
    }

    fun clearAll() {
        viewModelScope.launch {
            when (val r = repo.clearAll()) {
                is ApiResult.Success -> update { emptyList() }
                is ApiResult.Failure -> _messages.send(r.error.message)
            }
        }
    }

    private fun update(change: (List<AlertItem>) -> List<AlertItem>) {
        val s = _state.value as? LoadState.Ready ?: return
        _state.value = s.copy(data = change(s.data))
    }
}

@Composable
fun AlertsScreen(user: AppUser, onBack: () -> Unit, open: (String) -> Unit, vm: AlertsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var menu by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Alerts") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = {
                IconButton(onClick = vm::markAllRead) { Icon(Icons.Outlined.DoneAll, "Mark all read") }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, "More") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Alert settings") }, onClick = { menu = false; open(Routes.SETTINGS) })
                        DropdownMenuItem(text = { Text("Clear all") }, onClick = { menu = false; confirmClear = true })
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        OfflineBanner((state as? LoadState.Ready)?.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::load)
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, vm::load)
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load, modifier = Modifier.fillMaxSize()) {
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (s.data.isEmpty()) item { EmptyView("You're all caught up", "New orders, low stock and other alerts from the last 30 days show here.", Icons.Outlined.NotificationsNone) }
                    s.data.groupBy { Dates.sectionLabel(it.createdAt) }.forEach { (section, items) ->
                        item(key = "h-$section") { Text(section, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 6.dp)) }
                        items(items, key = { it.id }) { alert ->
                            ConstrainedColumn {
                                AlertRow(alert) {
                                    vm.opened(alert)
                                    Routes.fromAlertPath(alert.path, user)?.takeIf { it != Routes.ALERTS }?.let(open)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (confirmClear) ConfirmDialog("Clear all alerts?", "They're removed from this list on all your phones. New alerts still arrive.", "Clear all", destructive = true, onConfirm = vm::clearAll, onDismiss = { confirmClear = false })
}

@Composable
private fun AlertRow(alert: AlertItem, onClick: () -> Unit) {
    val (icon, tone) = when (alert.kind) {
        "orders" -> Icons.AutoMirrored.Outlined.ReceiptLong to Tone.Brand
        "lowStock" -> Icons.Outlined.Inventory2 to Tone.Warning
        "security" -> Icons.Outlined.Security to Tone.Danger
        "summary" -> Icons.Outlined.WbSunny to Tone.Info
        else -> Icons.Outlined.ChatBubbleOutline to Tone.Neutral
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick)
            .background(if (alert.read) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        IconBadge(icon, tone)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(alert.title, style = MaterialTheme.typography.titleSmall, fontWeight = if (alert.read) FontWeight.Medium else FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(Dates.relative(alert.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (alert.body.isNotBlank()) Text(alert.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!alert.read) Box(Modifier.padding(start = 8.dp, top = 6.dp).size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
    }
}


package com.yallahaul.admin.ui.drivers

import android.content.Intent
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.DriversRepository
import com.yallahaul.admin.core.model.DriverRow
import com.yallahaul.admin.core.model.DriversResponse
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.IconBadge
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.OfflineBanner
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

@HiltViewModel
class DriversViewModel @Inject constructor(private val repo: DriversRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<DriversResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<DriversResponse>> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        (_state.value as? LoadState.Ready)?.let { _state.value = it.copy(refreshing = true) }
        viewModelScope.launch {
            _state.value = when (val r = repo.list()) {
                is ApiResult.Success -> LoadState.Ready(r.data, offlineSince = r.cachedAt)
                is ApiResult.Failure -> (_state.value as? LoadState.Ready)?.copy(refreshing = false, refreshError = r.error.message) ?: LoadState.Failed(r.error)
            }
        }
    }

    /** "Cash received": the driver handed over the cash shown, for exactly these orders (as on the web). */
    fun settle(driver: DriverRow) = act {
        when (val r = repo.settle(driver.id, driver.cash.map { it.id })) {
            is ApiResult.Success -> "Received ${Money.format(r.data.amount, driver.currency)} from ${driver.name}"
            is ApiResult.Failure -> r.error.message
        }
    }

    fun add(name: String, phone: String) = act {
        when (val r = repo.add(name, phone)) { is ApiResult.Success -> "$name added. Send them their link from the web admin."; is ApiResult.Failure -> r.error.message }
    }

    fun setActive(driver: DriverRow, active: Boolean) = act {
        when (val r = repo.setActive(driver.id, active)) { is ApiResult.Success -> if (active) "${driver.name} is active" else "${driver.name} is turned off"; is ApiResult.Failure -> r.error.message }
    }

    private fun act(block: suspend () -> String) = viewModelScope.launch { _messages.send(block()); load() }
}

@Composable
fun DriversScreen(onBack: () -> Unit, open: (String) -> Unit, vm: DriversViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var adding by remember { mutableStateOf(false) }
    var settling by remember { mutableStateOf<DriverRow?>(null) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    val canManage = (state as? LoadState.Ready)?.data?.canManage == true
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text("Drivers") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
            OfflineBanner((state as? LoadState.Ready)?.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::load)
            when (val s = state) {
                is LoadState.Loading -> LoadingView()
                is LoadState.Failed -> ErrorView(s.error, vm::load)
                is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (s.data.drivers.isEmpty()) item { EmptyView("No drivers yet", if (canManage) "Add the people who deliver your orders." else null, Icons.Outlined.TwoWheeler) }
                        items(s.data.drivers, key = { it.id }) { d ->
                            ConstrainedColumn { DriverCardView(d, canManage, open, onSettle = { settling = d }, onActive = { vm.setActive(d, it) }) }
                        }
                    }
                }
            }
        }
        if (canManage) ExtendedFloatingActionButton(
            onClick = { adding = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Add driver") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        )
    }
    settling?.let { d ->
        ConfirmDialog(
            "Cash received from ${d.name}?",
            "${Money.format(d.cashTotal, d.currency)} from ${d.cash.size} deliver${if (d.cash.size == 1) "y" else "ies"} (${d.cash.joinToString { "#" + it.orderNumber }}). Only confirm once you have the cash in hand.",
            "Cash received", onConfirm = { vm.settle(d) }, onDismiss = { settling = null },
        )
    }
    if (adding) {
        var name by remember { mutableStateOf("") }
        var phone by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Add a driver") },
            text = {
                Column {
                    OutlinedTextField(name, { name = it.take(60) }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
                    OutlinedTextField(phone, { phone = it.take(40) }, label = { Text("Phone (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                }
            },
            confirmButton = { Button(onClick = { vm.add(name, phone); adding = false }, enabled = name.isNotBlank()) { Text("Add") } },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun DriverCardView(d: DriverRow, canManage: Boolean, open: (String) -> Unit, onSettle: () -> Unit, onActive: (Boolean) -> Unit) {
    val context = LocalContext.current
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(Icons.Outlined.TwoWheeler, if (d.active) Tone.Brand else Tone.Neutral)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(d.name, style = MaterialTheme.typography.titleMedium)
                Text("${d.delivered30} delivered in 30 days" + if (!d.active) " · off" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (d.phone.isNotBlank()) IconButton(onClick = { context.openSafely(Intent(Intent.ACTION_DIAL, "tel:${d.phone}".toUri())) }) { Icon(Icons.Outlined.Call, "Call ${d.name}") }
            if (canManage) Switch(checked = d.active, onCheckedChange = onActive)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("${d.out.size} on the way", if (d.out.isEmpty()) Tone.Neutral else Tone.Info)
            if (d.outCollect > 0) Pill("${Money.format(d.outCollect, d.currency)} to collect", Tone.Warning)
        }
        if (d.out.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            d.out.take(8).forEach { o ->
                Row(Modifier.fillMaxWidth().clickable { open(Routes.order(o.id)) }.padding(vertical = 6.dp)) {
                    Text("#${o.orderNumber}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(if (o.toCollect > 0) "collect ${Money.format(o.toCollect, d.currency)}" else "paid", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (d.cashTotal > 0) {
            HorizontalDivider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Holding ${Money.format(d.cashTotal, d.currency)}", style = MaterialTheme.typography.titleSmall)
                    Text("Cash from ${d.cash.size} deliver${if (d.cash.size == 1) "y" else "ies"} not handed over yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (canManage) OutlinedButton(onClick = onSettle, shape = RoundedCornerShape(14.dp)) { Text("Cash received") }
            }
        }
    }
}

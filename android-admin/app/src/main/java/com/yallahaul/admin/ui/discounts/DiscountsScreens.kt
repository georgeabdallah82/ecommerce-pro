package com.yallahaul.admin.ui.discounts

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Discount
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.Coupon
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.navigation.Routes
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

@Composable
fun DiscountsScreen(user: AppUser, onBack: () -> Unit, open: (String) -> Unit, vm: DiscountsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val canManage = user.can("coupons.manage")
    val currency = LocalStore.current.currency
    var confirmOff by remember { mutableStateOf<Coupon?>(null) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text("Discounts") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = { IconButton(onClick = vm::load) { Icon(Icons.Rounded.Refresh, "Refresh") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
            when (val s = state) {
                is LoadState.Loading -> LoadingView()
                is LoadState.Failed -> ErrorView(s.error, vm::load)
                is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load, modifier = Modifier.fillMaxSize()) {
                    val sorted = s.data.sortedWith(compareBy<Coupon> { it.state().ordinal }.thenByDescending { it.createdAt })
                    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (sorted.isEmpty()) item { EmptyView("No discounts yet", if (canManage) "Create a code to share with customers." else null, Icons.Outlined.Discount) }
                        items(sorted, key = { it.id }) { coupon ->
                            ConstrainedColumn {
                                CouponCard(coupon, currency, canManage,
                                    onClick = { if (canManage) open(Routes.discount(coupon.id)) },
                                    onToggle = { on -> if (on) vm.setActive(coupon, true) else confirmOff = coupon })
                            }
                        }
                    }
                }
            }
        }
        if (canManage) ExtendedFloatingActionButton(
            onClick = { open(Routes.discount("new")) }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("New discount") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        )
    }
    confirmOff?.let { c ->
        ConfirmDialog("Turn off ${c.code}?", "Customers can't use it until you turn it back on. Orders that already used it are not affected.", "Turn off",
            onConfirm = { vm.setActive(c, false) }, onDismiss = { confirmOff = null })
    }
}

@Composable
private fun CouponCard(coupon: Coupon, currency: String, canManage: Boolean, onClick: () -> Unit, onToggle: (Boolean) -> Unit) {
    val state = coupon.state()
    Surface(Modifier.fillMaxWidth().clickable(enabled = canManage, onClick = onClick), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (coupon.isAutomatic) "Automatic · ${coupon.code}" else coupon.code, style = MaterialTheme.typography.titleMedium, fontFamily = if (coupon.isAutomatic) null else FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(coupon.summary(currency), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (canManage) Switch(checked = coupon.isActive, onCheckedChange = onToggle)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                when (state) {
                    CouponState.Active -> Pill("Active", Tone.Success)
                    CouponState.Scheduled -> Pill("Starts ${Dates.date(coupon.startsAt)}", Tone.Info)
                    CouponState.Expired -> Pill("Expired", Tone.Neutral)
                    CouponState.UsedUp -> Pill("Used up", Tone.Neutral)
                    CouponState.Off -> Pill("Off", Tone.Neutral)
                }
                if (coupon.flashSale) Pill("Flash sale", Tone.Brand)
                Spacer(Modifier.weight(1f))
                Text("Used ${coupon.usedCount}${coupon.maxUses?.let { "/$it" } ?: ""}" + (coupon.expiresAt?.let { " · ends ${Dates.date(it)}" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun DiscountEditorScreen(onBack: () -> Unit, vm: DiscountEditorViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(state.done) { if (state.done) onBack() }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(if (vm.isNew) "New discount" else "Edit discount") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = {
                if (!vm.isNew && state.original != null) IconButton(onClick = { confirmDelete = true }, enabled = !state.saving) { Icon(Icons.Outlined.DeleteOutline, "Delete") }
                Button(onClick = vm::save, enabled = !state.saving && !state.loading && state.loadError == null, modifier = Modifier.padding(end = 8.dp)) {
                    if (state.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Save")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        when {
            state.loading -> LoadingView()
            state.loadError != null -> ErrorView(state.loadError!!, vm::load)
            else -> DiscountForm(state, vm)
        }
    }
    if (confirmDelete) state.original?.let { c ->
        ConfirmDialog("Delete ${c.code}?", "Customers won't be able to use it any more. Past orders keep their discount. This can't be undone.", "Delete", destructive = true, onConfirm = vm::delete, onDismiss = { confirmDelete = false })
    }
}

@Composable
private fun DiscountForm(state: DiscountEditorViewModel.UiState, vm: DiscountEditorViewModel) {
    val f = state.form
    val original = state.original
    val special = original != null && (original.type == "BUY_X_GET_Y" || original.appliesTo != "ALL_PRODUCTS" || original.flashSale)
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 32.dp)) {
        ConstrainedColumn {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (special) Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.tertiaryContainer) {
                    Text("This discount covers selected products or collections, buy X get Y, or a flash sale. The app keeps those settings as they are: change them on the website.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.padding(12.dp))
                }
                SectionCard(title = "Code") {
                    OutlinedTextField(
                        value = f.code, onValueChange = { v -> vm.edit { it.copy(code = v.uppercase().filter { c -> c.isLetterOrDigit() || c == '-' || c == '_' }.take(64)) } },
                        label = { Text(if (f.isAutomatic) "Name (customers don't type it)" else "Code customers type") },
                        isError = state.errors["code"] != null, supportingText = state.errors["code"]?.let { { Text(it) } },
                        trailingIcon = { if (vm.isNew) TextButton(onClick = vm::regenerateCode) { Text("New") } },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    )
                    SwitchRow("Apply automatically at checkout", f.isAutomatic) { v -> vm.edit { it.copy(isAutomatic = v) } }
                    SwitchRow("Turned on", f.isActive) { v -> vm.edit { it.copy(isActive = v) } }
                }
                if (original?.type != "BUY_X_GET_Y") SectionCard(title = "Discount") {
                    SegmentedChoice(listOf("PERCENTAGE" to "Percent", "FIXED" to "Amount", "FREE_SHIPPING" to "Free delivery"), f.type, { v -> vm.edit { it.copy(type = v) } })
                    Spacer(Modifier.height(12.dp))
                    if (f.type != "FREE_SHIPPING") OutlinedTextField(
                        value = f.value, onValueChange = { v -> vm.edit { it.copy(value = v.filter { c -> c.isDigit() || (c == '.' && f.type == "FIXED") }.take(10)) } },
                        label = { Text(if (f.type == "PERCENTAGE") "Percent off" else "Amount off") },
                        prefix = if (f.type == "FIXED") ({ Text(Money.symbol(vm.currency) + " ") }) else null,
                        suffix = if (f.type == "PERCENTAGE") ({ Text("%") }) else null,
                        isError = state.errors["value"] != null, supportingText = state.errors["value"]?.let { { Text(it) } },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                }
                SectionCard(title = "Limits") {
                    OutlinedTextField(
                        value = f.minSubtotal, onValueChange = { v -> vm.edit { it.copy(minSubtotal = v.filter { c -> c.isDigit() || c == '.' }.take(10)) } },
                        label = { Text("Minimum order (optional)") }, prefix = { Text(Money.symbol(vm.currency) + " ") },
                        isError = state.errors["min"] != null, supportingText = state.errors["min"]?.let { { Text(it) } },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                    OutlinedTextField(
                        value = f.maxUses, onValueChange = { v -> vm.edit { it.copy(maxUses = v.filter(Char::isDigit).take(7)) } },
                        label = { Text("Total uses allowed (optional)") },
                        isError = state.errors["maxUses"] != null, supportingText = state.errors["maxUses"]?.let { { Text(it) } } ?: original?.let { { Text("Used ${it.usedCount} times so far") } },
                        singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 6.dp), shape = RoundedCornerShape(14.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    SwitchRow("First order only", f.firstOrderOnly) { v -> vm.edit { it.copy(firstOrderOnly = v) } }
                    if (!f.isAutomatic) SwitchRow("Once per customer", f.oncePerCustomer) { v -> vm.edit { it.copy(oncePerCustomer = v) } }
                }
                SectionCard(title = "Dates") {
                    DateRow("Starts", f.startsAt, startOfDay = true, onPick = { v -> vm.edit { it.copy(startsAt = v) } })
                    DateRow("Ends", f.expiresAt, startOfDay = false, onPick = { v -> vm.edit { it.copy(expiresAt = v) } })
                    state.errors["expires"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Text("Dates follow this phone's time zone. An end date is the end of that day.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun DateRow(label: String, value: Instant?, startOfDay: Boolean, onPick: (Instant?) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val zone = ZoneId.systemDefault()
    Row(Modifier.fillMaxWidth().clickable { picking = true }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.CalendarMonth, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value?.let { Dates.date(it.toString(), zone) } ?: if (startOfDay) "Right away" else "No end date", style = MaterialTheme.typography.bodyLarge)
        }
        if (value != null) IconButton(onClick = { onPick(null) }) { Icon(Icons.Rounded.Close, "Clear $label") }
    }
    if (picking) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = (value ?: Instant.now()).atZone(zone).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let { millis ->
                        val day = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        onPick(at(day, startOfDay, zone))
                    }
                    picking = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
        ) { DatePicker(state = picker) }
    }
}

private fun at(day: LocalDate, startOfDay: Boolean, zone: ZoneId): Instant =
    (if (startOfDay) day.atStartOfDay(zone) else day.atTime(LocalTime.of(23, 59, 59)).atZone(zone)).toInstant()

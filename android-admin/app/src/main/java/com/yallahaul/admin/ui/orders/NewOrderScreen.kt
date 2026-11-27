package com.yallahaul.admin.ui.orders

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.OrdersRepository
import com.yallahaul.admin.core.data.ProductsRepository
import com.yallahaul.admin.core.model.ProductRow
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.LabeledValue
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SearchField
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.products.available
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import javax.inject.Inject

private val SOURCES = listOf("whatsapp" to "WhatsApp", "instagram" to "Instagram", "phone" to "Phone call", "in_store" to "In the shop", "other" to "Other")

/** One line of a new order: the product, the option chosen (when it has options) and how many. */
data class NewLine(val product: ProductRow, val variantId: String?, val variantName: String?, val unitPrice: Long, val quantity: Int)

/**
 * A new order typed in by staff: taken on WhatsApp, Instagram, by phone or in the shop. Saved through
 * the web's own POST /api/admin/orders/manual, which holds the stock, numbers the order and sends the
 * usual messages, exactly as Admin › Orders › New order.
 */
@HiltViewModel
class NewOrderViewModel @Inject constructor(
    private val orders: OrdersRepository,
    private val products: ProductsRepository,
    session: SessionManager,
) : ViewModel() {
    val currency = (session.state.value as? SessionState.SignedIn)?.store?.currency ?: "USD"

    data class Form(
        val source: String = "whatsapp",
        val name: String = "",
        val phone: String = "",
        val email: String = "",
        val line1: String = "",
        val city: String = "",
        val area: String = "",
        val notes: String = "",
        val lines: List<NewLine> = emptyList(),
        val delivery: String = "",
        val discount: String = "",
        val payment: String = "COD",
        val paid: Boolean = false,
        val confirmed: Boolean = true,
    )

    private val _form = MutableStateFlow(Form())
    val form: StateFlow<Form> = _form.asStateFlow()
    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()
    private val _results = MutableStateFlow<List<ProductRow>>(emptyList())
    val results: StateFlow<List<ProductRow>> = _results.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()
    private val _created = Channel<String>(Channel.BUFFERED)
    val created = _created.receiveAsFlow()
    private var searchJob: Job? = null

    fun edit(change: (Form) -> Form) = _form.update(change)

    fun search(query: String) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            (products.list("ACTIVE", query, 1) as? ApiResult.Success)?.let { _results.value = it.data.rows }
        }
    }

    fun add(product: ProductRow, variantId: String?) {
        val variant = product.variants.firstOrNull { it.id == variantId }
        val price = variant?.price ?: product.basePrice
        edit { f ->
            val existing = f.lines.indexOfFirst { it.product.id == product.id && it.variantId == variantId }
            if (existing >= 0) f.copy(lines = f.lines.mapIndexed { i, l -> if (i == existing) l.copy(quantity = (l.quantity + 1).coerceAtMost(99)) else l })
            else f.copy(lines = f.lines + NewLine(product, variantId, variant?.name, price, 1))
        }
    }

    fun setQuantity(index: Int, quantity: Int) = edit { f ->
        if (quantity <= 0) f.copy(lines = f.lines.filterIndexed { i, _ -> i != index })
        else f.copy(lines = f.lines.mapIndexed { i, l -> if (i == index) l.copy(quantity = quantity.coerceAtMost(99)) else l })
    }

    fun subtotal() = _form.value.lines.sumOf { it.unitPrice * it.quantity }

    fun save() {
        val f = _form.value
        val problem = when {
            f.lines.isEmpty() -> "Add at least one product"
            f.name.isBlank() -> "Add the customer's name"
            f.phone.isBlank() -> "Add the customer's phone number"
            else -> null
        }
        if (problem != null) { viewModelScope.launch { _messages.send(problem) }; return }
        if (_saving.value) return
        _saving.value = true
        val body = buildJsonObject {
            putJsonArray("items") {
                f.lines.forEach { l -> add(buildJsonObject { put("productId", l.product.id); l.variantId?.let { put("variantId", it) }; put("quantity", l.quantity) }) }
            }
            put("source", f.source)
            put("name", f.name.trim())
            put("phone", f.phone.trim())
            if (f.email.isNotBlank()) put("email", f.email.trim())
            put("line1", f.line1.trim())
            put("city", f.city.trim())
            if (f.area.isNotBlank()) put("region", f.area.trim())
            if (f.notes.isNotBlank()) put("notes", f.notes.trim())
            put("paymentMethod", f.payment)
            put("paymentStatus", if (f.paid) "PAID" else "UNPAID")
            put("confirmed", f.confirmed)
            put("shippingTotal", JsonPrimitive(Money.parse(f.delivery, currency) ?: 0))
            put("discount", JsonPrimitive(Money.parse(f.discount, currency) ?: 0))
        }
        viewModelScope.launch {
            when (val r = orders.createManual(body)) {
                is ApiResult.Success -> {
                    val order = r.data.order
                    _messages.send("Order #${order?.orderNumber ?: ""} created")
                    order?.id?.let { _created.send(it) }
                }
                is ApiResult.Failure -> _messages.send(r.error.message)
            }
            _saving.value = false
        }
    }
}

@Composable
fun NewOrderScreen(onBack: () -> Unit, onCreated: (String) -> Unit, vm: NewOrderViewModel = hiltViewModel()) {
    val f by vm.form.collectAsStateWithLifecycle()
    val saving by vm.saving.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var picking by remember { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }
    val dirty = f.lines.isNotEmpty() || f.name.isNotBlank() || f.phone.isNotBlank()
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(Unit) { vm.created.collect { onCreated(it) } }
    BackHandler(enabled = dirty) { leaving = true }
    val c = vm.currency
    val subtotal = vm.subtotal()
    val delivery = Money.parse(f.delivery, c) ?: 0L
    val discount = (Money.parse(f.discount, c) ?: 0L).coerceAtMost(subtotal)

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("New order") },
            navigationIcon = { IconButton(onClick = { if (dirty) leaving = true else onBack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = {
                Button(onClick = vm::save, enabled = !saving, modifier = Modifier.padding(end = 8.dp)) {
                    if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Create")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 32.dp)) {
            ConstrainedColumn {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SectionCard(title = "Where the order came from") {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SOURCES.forEach { (id, label) -> FilterChip(selected = f.source == id, onClick = { vm.edit { it.copy(source = id) } }, label = { Text(label) }) }
                        }
                    }
                    SectionCard(title = "Products", action = { TextButton(onClick = { picking = true; vm.search("") }) { Icon(Icons.Rounded.Add, null, Modifier.size(18.dp)); Text(" Add") } }) {
                        if (f.lines.isEmpty()) Text("No products yet. Tap Add.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        f.lines.forEachIndexed { i, l ->
                            if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.outlineVariant)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RemoteImage(l.product.images.firstOrNull()?.url, l.product.name, size = 44.dp)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(l.product.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(listOfNotNull(l.variantName, Money.format(l.unitPrice, c)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                IconButton(onClick = { vm.setQuantity(i, l.quantity - 1) }) { Icon(if (l.quantity == 1) Icons.Rounded.Close else Icons.Rounded.Remove, "Less") }
                                Text("${l.quantity}", style = MaterialTheme.typography.titleMedium)
                                IconButton(onClick = { vm.setQuantity(i, l.quantity + 1) }) { Icon(Icons.Rounded.Add, "More") }
                            }
                        }
                    }
                    SectionCard(title = "Customer") {
                        Field("Name", f.name, { v -> vm.edit { it.copy(name = v.take(120)) } }, capitalize = true)
                        Field("Phone (for WhatsApp and the driver)", f.phone, { v -> vm.edit { it.copy(phone = v.take(40)) } }, type = KeyboardType.Phone)
                        Field("Email (optional)", f.email, { v -> vm.edit { it.copy(email = v.take(200)) } }, type = KeyboardType.Email)
                    }
                    SectionCard(title = "Delivery") {
                        Field("Address", f.line1, { v -> vm.edit { it.copy(line1 = v.take(300)) } }, capitalize = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Field("City / town", f.city, { v -> vm.edit { it.copy(city = v.take(120)) } }, Modifier.weight(1f), capitalize = true)
                            Field("Area", f.area, { v -> vm.edit { it.copy(area = v.take(120)) } }, Modifier.weight(1f), capitalize = true)
                        }
                        Field("Note for the order (optional)", f.notes, { v -> vm.edit { it.copy(notes = v.take(1000)) } }, capitalize = true, lines = 2)
                    }
                    SectionCard(title = "Payment") {
                        SegmentedChoice(listOf("COD" to "Cash on delivery", "BANK_TRANSFER" to "Transfer"), f.payment, { v -> vm.edit { it.copy(payment = v) } })
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Already paid", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            Switch(checked = f.paid, onCheckedChange = { v -> vm.edit { it.copy(paid = v) } })
                        }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Customer already confirmed", style = MaterialTheme.typography.bodyLarge)
                                Text("Starts the order as Confirmed instead of Pending", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(checked = f.confirmed, onCheckedChange = { v -> vm.edit { it.copy(confirmed = v) } })
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
                            Field("Delivery fee", f.delivery, { v -> vm.edit { it.copy(delivery = v.filter { ch -> ch.isDigit() || ch == '.' }.take(10)) } }, Modifier.weight(1f), type = KeyboardType.Decimal, prefix = Money.symbol(c))
                            Field("Discount", f.discount, { v -> vm.edit { it.copy(discount = v.filter { ch -> ch.isDigit() || ch == '.' }.take(10)) } }, Modifier.weight(1f), type = KeyboardType.Decimal, prefix = Money.symbol(c))
                        }
                        HorizontalDivider(Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        LabeledValue("Subtotal", Money.format(subtotal, c))
                        if (delivery > 0) LabeledValue("Delivery", Money.format(delivery, c))
                        if (discount > 0) LabeledValue("Discount", "−" + Money.format(discount, c))
                        LabeledValue("Total", Money.format(subtotal - discount + delivery, c), emphasize = true)
                        Text("The store checks prices and stock again when you create it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    if (picking) ProductPicker(vm, onDismiss = { picking = false })
    if (leaving) ConfirmDialog("Discard this order?", "It hasn't been created yet.", "Discard", destructive = true, onConfirm = onBack, onDismiss = { leaving = false })
}

@Composable
private fun ProductPicker(vm: NewOrderViewModel, onDismiss: () -> Unit) {
    val results by vm.results.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var options by remember { mutableStateOf<ProductRow?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a product") },
        text = {
            Column {
                SearchField(query, { query = it; vm.search(it) }, "Search products")
                Spacer(Modifier.height(8.dp))
                LazyColumn(Modifier.heightIn(max = 380.dp)) {
                    items(results, key = { it.id }) { p ->
                        val units = p.available()
                        Row(Modifier.fillMaxWidth().clickable { if (p.variants.size > 1) options = p else vm.add(p, p.variants.firstOrNull()?.id) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            RemoteImage(p.images.firstOrNull()?.url, p.name, size = 40.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(Money.format(p.basePrice, vm.currency) + (units?.let { " · $it in stock" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Icon(Icons.Rounded.Add, "Add", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
    options?.let { p ->
        AlertDialog(
            onDismissRequest = { options = null },
            title = { Text(p.name) },
            text = {
                Column {
                    p.variants.forEach { v ->
                        val left = v.inventory.sumOf { (it.quantity - it.reserved).coerceAtLeast(0) }
                        Row(Modifier.fillMaxWidth().clickable { vm.add(p, v.id); options = null }.padding(vertical = 10.dp)) {
                            Text(v.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            Text(Money.format(v.price ?: p.basePrice, vm.currency) + if (p.trackInventory) " · $left left" else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { options = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Field(
    label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier.fillMaxWidth(),
    type: KeyboardType = KeyboardType.Text, capitalize: Boolean = false, lines: Int = 1, prefix: String? = null,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, modifier = modifier.padding(bottom = 6.dp),
        singleLine = lines == 1, minLines = lines, shape = RoundedCornerShape(14.dp),
        prefix = prefix?.let { { Text("$it ") } },
        keyboardOptions = KeyboardOptions(keyboardType = type, capitalization = if (capitalize) KeyboardCapitalization.Sentences else KeyboardCapitalization.None),
    )
}


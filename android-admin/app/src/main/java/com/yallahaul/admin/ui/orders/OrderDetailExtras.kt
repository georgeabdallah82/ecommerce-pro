package com.yallahaul.admin.ui.orders

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.AssignmentReturn
import androidx.compose.material.icons.outlined.CurrencyExchange
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.documents.OrderDocuments
import com.yallahaul.admin.core.model.OrderDetailResponse
import com.yallahaul.admin.core.model.ReturnLine
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.openSafely
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// The v1.1 parts of the order page: WhatsApp follow-up, the driver, returns and refunds, and the
// invoice / packing slip.

@Composable
internal fun WhatsappCard(data: OrderDetailResponse, busy: Boolean, vm: OrderDetailViewModel) {
    val context = LocalContext.current
    var recording by remember { mutableStateOf(false) }
    SectionCard(title = "WhatsApp") {
        val link = data.whatsapp.link
        if (link != null) {
            Text("Opens a chat with the customer with the order summary ready, asking them to confirm.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { context.openSafely(Intent(Intent.ACTION_VIEW, link.toUri())) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.AutoMirrored.Outlined.Chat, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Ask to confirm")
                }
                if (data.actions.canManage) OutlinedButton(onClick = { recording = true }, enabled = !busy, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) { Text("Their answer") }
            }
        } else {
            Text(data.whatsapp.problem ?: "No WhatsApp number on this order.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (recording) {
        var choice by remember { mutableStateOf(data.whatsapp.outcomes.firstOrNull()?.id ?: "") }
        var detail by rememberSaveable { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { recording = false },
            title = { Text("What did the customer say?") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    data.whatsapp.outcomes.forEach { o ->
                        Row(Modifier.fillMaxWidth().clickable { choice = o.id }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = choice == o.id, onClick = { choice = o.id })
                            Text(o.label, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    OutlinedTextField(detail, { detail = it.take(500) }, label = { Text("Details (optional)") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    Text("Saved as a note and on the timeline. It doesn't change the order: confirm or cancel it yourself.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                }
            },
            confirmButton = { Button(onClick = { vm.recordWhatsapp(choice, detail); recording = false }, enabled = choice.isNotEmpty()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { recording = false }) { Text("Cancel") } },
        )
    }
}

@Composable
internal fun DriverCard(data: OrderDetailResponse, busy: Boolean, vm: OrderDetailViewModel) {
    var choosing by remember { mutableStateOf(false) }
    val drivers by vm.drivers.collectAsStateWithLifecycle()
    SectionCard(title = "Driver") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.TwoWheeler, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Text(data.order.driver?.name ?: "No driver yet", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = { vm.loadDrivers(); choosing = true }, enabled = !busy) { Text(if (data.order.driver == null) "Choose" else "Change") }
        }
    }
    if (choosing) {
        AlertDialog(
            onDismissRequest = { choosing = false },
            title = { Text("Give to a driver") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    if (drivers.isEmpty()) Text("No active drivers. Add them in More › Drivers.", style = MaterialTheme.typography.bodyMedium)
                    drivers.forEach { d ->
                        Row(Modifier.fillMaxWidth().clickable { vm.assignDriver(d.id); choosing = false }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = data.order.driver?.id == d.id, onClick = { vm.assignDriver(d.id); choosing = false })
                            Column {
                                Text(d.name, style = MaterialTheme.typography.bodyLarge)
                                Text("${d.out.size} on the way", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            },
            confirmButton = { if (data.order.driver != null) TextButton(onClick = { vm.assignDriver(null); choosing = false }) { Text("Remove driver") } },
            dismissButton = { TextButton(onClick = { choosing = false }) { Text("Close") } },
        )
    }
}

@Composable
internal fun MoneyBackCard(data: OrderDetailResponse, busy: Boolean, vm: OrderDetailViewModel) {
    val order = data.order
    val canRefund = data.actions.canRefund && data.actions.refundable > 0 && !data.actions.refundPending
    var returning by remember { mutableStateOf(false) }
    var refunding by remember { mutableStateOf(false) }
    val confirm by vm.needsConfirm.collectAsStateWithLifecycle()
    SectionCard(title = "Returns and refunds") {
        if (data.actions.refundPending) Text("A refund is being processed for this order.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else if (data.actions.refundable > 0) Text("${Money.format(data.actions.refundable, order.currency)} can still be refunded.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (data.actions.canReturn) OutlinedButton(onClick = { returning = true }, enabled = !busy, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                Icon(Icons.AutoMirrored.Outlined.AssignmentReturn, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Return")
            }
            if (canRefund) OutlinedButton(onClick = { refunding = true }, enabled = !busy, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                Icon(Icons.Outlined.CurrencyExchange, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Refund")
            }
        }
    }
    if (returning) ReturnDialog(data, canRefund, onDismiss = { returning = false }) { lines, restock, refund, reason -> vm.createReturn(lines, restock, refund, reason) }
    if (refunding) RefundDialog(data, onDismiss = { refunding = false }) { amount, reason -> vm.refund(amount, reason) }
    if (confirm != null) ConfirmIdentityDialog(busy = busy, onDismiss = vm::cancelConfirm) { password, code -> vm.confirmAndRefund(password, code) }
}

@Composable
private fun ReturnDialog(data: OrderDetailResponse, canRefund: Boolean, onDismiss: () -> Unit, onSave: (List<ReturnLine>, Boolean, Long, String) -> Unit) {
    val order = data.order
    val qty = remember { mutableStateMapOf<String, Int>() }
    var restock by remember { mutableStateOf(true) }
    var refundText by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    val refund = if (canRefund) Money.parse(refundText, order.currency) ?: 0L else 0L
    val lines = qty.filterValues { it > 0 }.map { (id, n) -> ReturnLine(id, n) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record a return") },
        text = {
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                Text("How many of each came back?", style = MaterialTheme.typography.bodyMedium)
                order.items.forEach { item ->
                    val n = qty[item.id] ?: 0
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(item.name, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        IconButton(onClick = { qty[item.id] = (n - 1).coerceAtLeast(0) }) { Icon(Icons.Rounded.Remove, "One less") }
                        Text("$n/${item.quantity}", style = MaterialTheme.typography.titleSmall)
                        IconButton(onClick = { qty[item.id] = (n + 1).coerceAtMost(item.quantity) }) { Icon(Icons.Rounded.Add, "One more") }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Put the items back in stock", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Switch(checked = restock, onCheckedChange = { restock = it })
                }
                if (canRefund) OutlinedTextField(
                    refundText, { v -> refundText = v.filter { it.isDigit() || it == '.' }.take(10) },
                    label = { Text("Refund now (optional)") }, prefix = { Text(Money.symbol(order.currency) + " ") },
                    supportingText = { Text("Up to ${Money.format(data.actions.refundable, order.currency)}") },
                    isError = refund > data.actions.refundable, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(reason, { reason = it.take(300) }, label = { Text("Reason") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
            }
        },
        confirmButton = {
            Button(onClick = { onSave(lines, restock, refund, reason); onDismiss() }, enabled = lines.isNotEmpty() && refund <= data.actions.refundable) { Text("Save return") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun RefundDialog(data: OrderDetailResponse, onDismiss: () -> Unit, onRefund: (Long, String) -> Unit) {
    val order = data.order
    var amountText by rememberSaveable { mutableStateOf(Money.toInput(data.actions.refundable, order.currency)) }
    var reason by rememberSaveable { mutableStateOf("") }
    val amount = Money.parse(amountText, order.currency) ?: 0L
    val ok = amount in 1..data.actions.refundable
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Refund #${order.orderNumber}") },
        text = {
            Column {
                Text("Money goes back the way it was paid (card, wallet, or recorded as paid back by hand). You'll confirm it's you first.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    amountText, { v -> amountText = v.filter { it.isDigit() || it == '.' }.take(10) },
                    label = { Text("Amount") }, prefix = { Text(Money.symbol(order.currency) + " ") }, isError = !ok,
                    supportingText = { Text("Up to ${Money.format(data.actions.refundable, order.currency)}") },
                    singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(reason, { reason = it.take(300) }, label = { Text("Reason") }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
            }
        },
        confirmButton = { Button(onClick = { onRefund(amount, reason); onDismiss() }, enabled = ok) { Text("Refund ${Money.format(amount, order.currency)}") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** "Confirm it's you": the password, or a code from the 2-step app, as on the website (lasts 10 minutes). */
@Composable
internal fun ConfirmIdentityDialog(busy: Boolean, onDismiss: () -> Unit, onConfirm: (String?, String?) -> Unit) {
    var useCode by remember { mutableStateOf(true) }
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Confirm it's you") },
        text = {
            Column {
                Text(if (useCode) "Type the 6-digit code from your authenticator app." else "Type your admin password.", style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(
                    value, { value = it.take(if (useCode) 20 else 128) },
                    label = { Text(if (useCode) "Code" else "Password") }, singleLine = true,
                    visualTransformation = if (useCode) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = if (useCode) KeyboardType.NumberPassword else KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                TextButton(onClick = { useCode = !useCode; value = "" }) { Text(if (useCode) "Use my password instead" else "Use a code instead") }
            }
        },
        confirmButton = { Button(onClick = { if (useCode) onConfirm(null, value) else onConfirm(value, null) }, enabled = value.isNotBlank() && !busy) { Text("Confirm") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
internal fun DocumentsCard(data: OrderDetailResponse) {
    val context = LocalContext.current
    val store = LocalStore.current
    val snackbar = LocalSnackbar.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun run(kind: OrderDocuments.Kind, print: Boolean) = scope.launch {
        val file = runCatching { withContext(Dispatchers.IO) { OrderDocuments.create(context, data.order, kind, store.name) } }.getOrNull()
        if (file == null) { snackbar.showSnackbar("Couldn't make the ${kind.title.lowercase()}"); return@launch }
        val name = "${kind.title} #${data.order.orderNumber}"
        runCatching { if (print) OrderDocuments.print(context, file, name) else OrderDocuments.share(context, file, name) }
            .onFailure { snackbar.showSnackbar("No app on this phone can ${if (print) "print" else "share"} it.") }
    }
    SectionCard(title = "Documents") {
        DocumentRow(Icons.Outlined.Description, "Invoice", "With prices, for the customer", onShare = { run(OrderDocuments.Kind.Invoice, false) }, onPrint = { run(OrderDocuments.Kind.Invoice, true) })
        DocumentRow(Icons.Outlined.Inventory2, "Packing slip", "Without prices, to put in the parcel", onShare = { run(OrderDocuments.Kind.PackingSlip, false) }, onPrint = { run(OrderDocuments.Kind.PackingSlip, true) })
    }
}

@Composable
private fun DocumentRow(icon: ImageVector, title: String, subtitle: String, onShare: () -> Unit, onPrint: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onShare) { Icon(Icons.Outlined.Share, "Share $title") }
        IconButton(onClick = onPrint) { Icon(Icons.Outlined.Print, "Print $title") }
    }
}

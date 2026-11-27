package com.yallahaul.admin.ui.orders

import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.openSafely
import androidx.core.net.toUri
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.data.OrdersRepository
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.OrderDetail
import com.yallahaul.admin.core.model.OrderDetailResponse
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.InlineError
import com.yallahaul.admin.ui.components.LabeledValue
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.orderTone
import com.yallahaul.admin.ui.components.paymentTone
import com.yallahaul.admin.ui.navigation.Routes

@Composable
fun OrderDetailScreen(user: AppUser, onBack: () -> Unit, open: (String) -> Unit, vm: OrderDetailViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    val title = (state as? LoadState.Ready)?.data?.order?.orderNumber?.let { "Order #$it" } ?: "Order"
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(title) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = { IconButton(onClick = vm::refresh, enabled = !busy) { Icon(Icons.Rounded.Refresh, "Refresh") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        OfflineBanner((state as? LoadState.Ready)?.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), vm::refresh)
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, onRetry = vm::refresh)
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                OrderContent(s.data, s.refreshError, busy, user, vm, open)
            }
        }
    }
}

@Composable
private fun OrderContent(data: OrderDetailResponse, refreshError: String?, busy: Boolean, user: AppUser, vm: OrderDetailViewModel, open: (String) -> Unit) {
    val order = data.order
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (refreshError != null) item { InlineError(refreshError, vm::refresh) }
        item { ConstrainedColumn { HeaderCard(order) } }
        if (data.actions.canManage && (data.actions.nextStatuses.isNotEmpty() || data.actions.canMarkPaid)) {
            item { ConstrainedColumn { ActionsCard(data, busy, vm) } }
        }
        item { ConstrainedColumn { ItemsCard(order) } }
        item { ConstrainedColumn { CustomerCard(order, user, open) } }
        if (order.status !in setOf("CANCELLED", "REFUNDED") && (data.whatsapp.link != null || data.whatsapp.problem != null)) item { ConstrainedColumn { WhatsappCard(data, busy, vm) } }
        item { ConstrainedColumn { DeliveryCard(order, data.actions.canManage, busy, vm) } }
        if (data.actions.canAssignDriver || order.driver != null) item { ConstrainedColumn { DriverCard(data, busy || !data.actions.canAssignDriver, vm) } }
        item { ConstrainedColumn { PaymentCard(order) } }
        if (data.actions.canReturn || (data.actions.canRefund && data.actions.refundable > 0)) item { ConstrainedColumn { MoneyBackCard(data, busy, vm) } }
        item { ConstrainedColumn { DocumentsCard(data) } }
        if (order.events.isNotEmpty()) item { ConstrainedColumn { TimelineCard(order) } }
        item { ConstrainedColumn { NotesCard(order, data.actions.canManage, busy, vm) } }
        item { Spacer(Modifier.windowInsetsPadding(WindowInsets.navigationBars)) }
    }
}

@Composable
private fun HeaderCard(order: OrderDetail) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(Money.format(order.grandTotal, order.currency), style = MaterialTheme.typography.headlineMedium)
                Text(Dates.dateTime(order.createdAt), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (order.isGift) Pill("Gift", Tone.Brand, icon = Icons.Outlined.CardGiftcard)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Pill(Labels.orderStatus(order.status), orderTone(order.status))
            Pill(Labels.paymentStatus(order.paymentStatus), paymentTone(order.paymentStatus))
            Pill(Labels.paymentMethod(order.paymentMethod), Tone.Neutral)
        }
    }
}

@Composable
private fun ActionsCard(data: OrderDetailResponse, busy: Boolean, vm: OrderDetailViewModel) {
    val order = data.order
    val next = data.actions.nextStatuses
    val forward = next.filter { it != "CANCELLED" }
    val canCancel = "CANCELLED" in next
    var confirmStatus by remember { mutableStateOf<String?>(null) }
    var shipDialog by remember { mutableStateOf(false) }
    var confirmPaid by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val paid = order.paymentStatus == "PAID" || order.paymentStatus == "PARTIALLY_REFUNDED"

    SectionCard(title = "Next step") {
        if (forward.isNotEmpty()) {
            val primary = forward.first()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = { if (primary == "SHIPPED") shipDialog = true else confirmStatus = primary },
                    enabled = !busy,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(16.dp),
                ) { Text(Labels.orderAction(primary), style = MaterialTheme.typography.titleSmall) }
                if (forward.size > 1) {
                    Spacer(Modifier.width(8.dp))
                    Box {
                        FilledTonalIconButton(onClick = { menu = true }, enabled = !busy, modifier = Modifier.size(52.dp)) { Icon(Icons.Rounded.ExpandMore, "More steps") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            forward.drop(1).forEach { status ->
                                DropdownMenuItem(text = { Text(Labels.orderAction(status)) }, onClick = { menu = false; if (status == "SHIPPED") shipDialog = true else confirmStatus = status })
                            }
                        }
                    }
                }
            }
        }
        if (data.actions.canMarkPaid || canCancel) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (data.actions.canMarkPaid) OutlinedButton(onClick = { confirmPaid = true }, enabled = !busy, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Outlined.Payments, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Mark as paid")
                }
                if (canCancel) OutlinedButton(
                    onClick = { confirmStatus = "CANCELLED" }, enabled = !busy, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Cancel order") }
            }
        }
        if (order.paymentMethod == "COD" && "DELIVERED" in forward) {
            Text("Cash on delivery: marking it delivered also marks it paid.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        }
    }

    confirmStatus?.let { status ->
        val cancelling = status == "CANCELLED"
        val body = when {
            cancelling && paid && data.actions.canRefund -> "This order is paid. Cancelling it refunds ${Money.format(order.grandTotal, order.currency)} to the customer, puts the items back in stock and tells the customer. This can't be undone."
            cancelling && paid -> "This order is paid, so cancelling it means a refund. Only the owner or an admin with refund access can do that."
            cancelling -> "The items go back in stock and the customer is told. This can't be undone."
            else -> "Order #${order.orderNumber} will move to \"${Labels.orderStatus(status)}\" and the customer will be updated."
        }
        ConfirmDialog(
            title = if (cancelling) "Cancel order #${order.orderNumber}?" else "${Labels.orderAction(status)}?",
            body = body,
            confirmLabel = if (cancelling) "Cancel order" else Labels.orderAction(status),
            destructive = cancelling,
            onConfirm = { vm.setStatus(status) },
            onDismiss = { confirmStatus = null },
        )
    }
    if (confirmPaid) ConfirmDialog(
        title = "Mark as paid?",
        body = "Only do this once the money for ${Money.format(order.grandTotal, order.currency)} has arrived.",
        confirmLabel = "Mark as paid",
        onConfirm = vm::markPaid,
        onDismiss = { confirmPaid = false },
    )
    if (shipDialog) ShipDialog(order, onDismiss = { shipDialog = false }) { tracking -> vm.setStatus("SHIPPED", tracking) }
}

@Composable
private fun ShipDialog(order: OrderDetail, onDismiss: () -> Unit, onConfirm: (OrdersRepository.Tracking) -> Unit) {
    var number by rememberSaveable { mutableStateOf(order.trackingNumber ?: "") }
    var company by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf("") }
    val urlOk = url.isBlank() || url.startsWith("https://") || url.startsWith("http://")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Send out for delivery") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("The stock is taken off and the customer is told. Tracking details are optional.", style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(number, { number = it.take(120) }, label = { Text("Tracking number") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(company, { company = it.take(120) }, label = { Text("Courier") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(url, { url = it.take(500) }, label = { Text("Tracking link") }, singleLine = true, isError = !urlOk,
                    supportingText = { if (!urlOk) Text("Must start with https://") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(enabled = urlOk, onClick = {
                onConfirm(OrdersRepository.Tracking(number.trim().ifBlank { null }, company.trim().ifBlank { null }, url.trim().ifBlank { null }))
                onDismiss()
            }) { Text("Send out") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not yet") } },
    )
}

@Composable
private fun ItemsCard(order: OrderDetail) {
    val count = order.items.sumOf { it.quantity }
    SectionCard(title = "$count item${if (count == 1) "" else "s"}") {
        order.items.forEachIndexed { index, item ->
            if (index > 0) HorizontalDivider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    RemoteImage(item.imageUrl, item.name, size = 56.dp)
                    Box(Modifier.align(Alignment.TopEnd).padding(2.dp).clip(CircleShape).background(MaterialTheme.colorScheme.inverseSurface).padding(horizontal = 6.dp, vertical = 1.dp)) {
                        Text("${item.quantity}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.inverseOnSurface)
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(item.variant, "SKU ${item.sku}").joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    Text("${item.quantity} × ${Money.format(item.unitPrice, order.currency)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(Money.format(item.totalPrice, order.currency), style = MaterialTheme.typography.titleSmall)
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
        LabeledValue("Subtotal", Money.format(order.subtotal, order.currency))
        if (order.discountTotal > 0) LabeledValue("Discount" + (order.couponCode?.let { " ($it)" } ?: ""), "−" + Money.format(order.discountTotal, order.currency))
        LabeledValue("Delivery" + (order.shippingMethod?.takeIf { !it.equals("Delivery", ignoreCase = true) }?.let { " · $it" } ?: ""), if (order.shippingTotal == 0L) "Free" else Money.format(order.shippingTotal, order.currency))
        if (order.taxTotal > 0) LabeledValue("Tax", Money.format(order.taxTotal, order.currency))
        LabeledValue("Total", Money.format(order.grandTotal, order.currency), emphasize = true)
    }
}

@Composable
private fun CustomerCard(order: OrderDetail, user: AppUser, open: (String) -> Unit) {
    val context = LocalContext.current
    val c = order.customer
    SectionCard(title = "Customer", action = {
        if (c.hasAccount && c.id != null && user.can("customers.view")) TextButton(onClick = { open(Routes.customer(c.id)) }) { Text("Profile") }
    }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            com.yallahaul.admin.ui.components.Avatar(c.name)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(c.name, style = MaterialTheme.typography.titleMedium)
                Text(if (c.hasAccount) "Has an account" else "Guest checkout", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            c.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                ContactButton(Icons.Outlined.Call, "Call") { context.openSafely(Intent(Intent.ACTION_DIAL, "tel:$phone".toUri())) }
                ContactButton(Icons.AutoMirrored.Outlined.Chat, "WhatsApp") {
                    val digits = phone.filter(Char::isDigit)
                    context.openSafely(Intent(Intent.ACTION_VIEW, "https://wa.me/$digits".toUri()))
                }
            }
            c.email?.takeIf { it.isNotBlank() }?.let { email ->
                ContactButton(Icons.Outlined.Email, "Email") { context.openSafely(Intent(Intent.ACTION_SENDTO, "mailto:$email".toUri())) }
            }
        }
        Spacer(Modifier.height(8.dp))
        c.phone?.takeIf { it.isNotBlank() }?.let { LabeledValue("Phone", it) }
        c.email?.takeIf { it.isNotBlank() }?.let { LabeledValue("Email", it) }
        if (order.whatsappUpdates) LabeledValue("Updates", "On WhatsApp")
    }
}

@Composable
private fun ContactButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(14.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)) {
        Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(label)
    }
}

private val ADDRESS_ORDER = listOf("line1", "address", "street", "building", "floor", "line2", "area", "city", "region", "postalCode", "country")

@Composable
private fun DeliveryCard(order: OrderDetail, canManage: Boolean, busy: Boolean, vm: OrderDetailViewModel) {
    val context = LocalContext.current
    var editTracking by remember { mutableStateOf(false) }
    val a = order.shippingAddress
    val lines = ADDRESS_ORDER.mapNotNull { a[it]?.takeIf { v -> v.isNotBlank() } }.distinct()
    SectionCard(title = "Delivery") {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.Place, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                listOfNotNull(a["firstName"], a["lastName"]).joinToString(" ").takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                lines.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                a["phone"]?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (lines.isNotEmpty()) TextButton(onClick = {
                val query = Uri.encode(lines.joinToString(", "))
                context.openSafely(Intent(Intent.ACTION_VIEW, "geo:0,0?q=$query".toUri()))
            }) { Text("Map") }
        }
        val extra = a.filterKeys { it !in ADDRESS_ORDER && it !in setOf("firstName", "lastName", "phone", "label", "isDefault", "email", "lat", "lng") }
        extra.forEach { (key, value) -> LabeledValue(key.replaceFirstChar { it.uppercase() }, value) }
        order.notes?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(8.dp))
            Text("Customer note", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(it, style = MaterialTheme.typography.bodyMedium)
        }
        order.giftMessage?.takeIf { order.isGift && it.isNotBlank() }?.let {
            Spacer(Modifier.height(8.dp))
            Text("Gift message", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("“$it”", style = MaterialTheme.typography.bodyMedium)
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.LocalShipping, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(order.trackingNumber?.let { "Tracking $it" } ?: "No tracking number", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            if (canManage && order.status != "CANCELLED") TextButton(onClick = { editTracking = true }, enabled = !busy) { Text(if (order.trackingNumber == null) "Add" else "Edit") }
        }
        order.fulfillments.firstOrNull()?.let { shipment ->
            shipment.trackingCompany?.let { LabeledValue("Courier", it) }
            shipment.trackingUrl?.takeIf { it.startsWith("https://") || it.startsWith("http://") }?.let { link ->
                TextButton(onClick = { context.openSafely(Intent(Intent.ACTION_VIEW, link.toUri())) }) { Text("Open tracking page") }
            }
        }
    }
    if (editTracking) {
        var value by rememberSaveable { mutableStateOf(order.trackingNumber ?: "") }
        AlertDialog(
            onDismissRequest = { editTracking = false },
            title = { Text("Tracking number") },
            text = {
                Column {
                    if (order.status == "SHIPPED" || order.status == "DELIVERED") Text("The customer is told about the change.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 10.dp))
                    OutlinedTextField(value, { value = it.take(120) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { Button(onClick = { vm.updateTracking(value); editTracking = false }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editTracking = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun PaymentCard(order: OrderDetail) {
    var viewing by remember { mutableStateOf<String?>(null) }
    SectionCard(title = "Payment") {
        LabeledValue("Method", Labels.paymentMethod(order.paymentMethod))
        LabeledValue("Status", Labels.paymentStatus(order.paymentStatus))
        order.payments.filter { it.provider != "checkout" || it.amount > 0 }.forEach { tx ->
            LabeledValue("${tx.provider.replaceFirstChar { it.uppercase() }} · ${tx.status.replace('_', ' ')}", Money.format(tx.amount, tx.currency.ifBlank { order.currency }))
        }
        if (order.paymentProofs.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text("Transfer screenshots", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(order.paymentProofs, key = { it.id }) { proof ->
                    Column(Modifier.clickable { viewing = proof.path }) {
                        RemoteImage(proof.path, "Payment screenshot", size = 96.dp, shape = RoundedCornerShape(14.dp))
                        Text(Dates.relative(proof.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    viewing?.let { path ->
        Dialog(onDismissRequest = { viewing = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.92f)).clickable { viewing = null }, contentAlignment = Alignment.Center) {
                RemoteImage(path, "Payment screenshot", modifier = Modifier.fillMaxWidth().aspectRatio(0.6f).padding(16.dp), contentScale = ContentScale.Fit, shape = RoundedCornerShape(12.dp))
            }
        }
    }
}

@Composable
private fun TimelineCard(order: OrderDetail) {
    SectionCard(title = "Timeline") {
        order.events.take(30).forEachIndexed { index, event ->
            Row {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(if (index == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline))
                    if (index < order.events.size - 1) Box(Modifier.width(2.dp).height(44.dp).background(MaterialTheme.colorScheme.outlineVariant))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f).padding(bottom = 10.dp)) {
                    Text(event.message ?: Labels.orderStatus(event.status), style = MaterialTheme.typography.bodyMedium, fontWeight = if (index == 0) FontWeight.SemiBold else FontWeight.Normal)
                    Text(Dates.dateTime(event.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun NotesCard(order: OrderDetail, canManage: Boolean, busy: Boolean, vm: OrderDetailViewModel) {
    var draft by rememberSaveable { mutableStateOf("") }
    SectionCard(title = "Staff notes") {
        if (order.staffNotes.isEmpty()) Text("Only staff see these notes.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        order.staffNotes.forEach { note ->
            Row(Modifier.padding(vertical = 6.dp)) {
                Icon(Icons.Outlined.Person, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(note.body, style = MaterialTheme.typography.bodyMedium)
                    Text("${note.author} · ${Dates.relative(note.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (canManage) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = draft, onValueChange = { draft = it.take(5000) },
                placeholder = { Text("Add a note for the team") },
                modifier = Modifier.fillMaxWidth(), minLines = 2, shape = RoundedCornerShape(14.dp),
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.addNote(draft); draft = "" }, enabled = draft.isNotBlank() && !busy, modifier = Modifier.align(Alignment.End)) { Text("Add note") }
        }
    }
}


package com.yallahaul.admin.ui.products

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.stockTone

@Composable
fun ProductEditorScreen(user: AppUser, onBack: () -> Unit, vm: ProductEditorViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val canEdit = user.can("products.manage")
    var confirmLeave by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(state.saved) {
        if (state.saved) { vm.savedHandled(); if (vm.isNew) onBack() else vm.load() }
    }
    val leave = { if (state.dirty) confirmLeave = true else onBack() }
    BackHandler(enabled = state.dirty) { confirmLeave = true }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(if (vm.isNew) "New product" else "Edit product") },
            navigationIcon = { IconButton(onClick = leave) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            actions = {
                if (canEdit && !state.loading && state.loadError == null) {
                    Button(onClick = vm::save, enabled = !state.saving && state.uploading == 0 && (state.dirty || vm.isNew), modifier = Modifier.padding(end = 8.dp)) {
                        if (state.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text("Save")
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        when {
            state.loading -> LoadingView()
            state.loadError != null -> ErrorView(state.loadError!!, vm::load)
            else -> EditorForm(state, vm, canEdit)
        }
    }
    if (confirmLeave) ConfirmDialog(
        title = "Discard your changes?",
        body = "Your edits to this product haven't been saved.",
        confirmLabel = "Discard",
        destructive = true,
        onConfirm = onBack,
        onDismiss = { confirmLeave = false },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditorForm(state: ProductEditorViewModel.UiState, vm: ProductEditorViewModel, canEdit: Boolean) {
    val f = state.form
    val currency = vm.storeCurrency
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris -> if (uris.isNotEmpty()) vm.uploadImages(uris) }
    var pickCollections by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 32.dp)) {
        ConstrainedColumn {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                SectionCard(title = "Photos", action = { if (state.uploading > 0) Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)); Text("Uploading…", style = MaterialTheme.typography.labelMedium) } }) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        itemsIndexed(f.images, key = { i, img -> img.id ?: "${img.url}-$i" }) { index, image ->
                            Box {
                                RemoteImage(image.url, image.alt, size = 104.dp, shape = RoundedCornerShape(16.dp), modifier = Modifier.clickable(enabled = canEdit && index > 0) { vm.moveImageFirst(image) })
                                if (index == 0) Box(Modifier.align(Alignment.BottomStart).padding(6.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.inverseSurface.copy(alpha = 0.8f)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Star, null, tint = MaterialTheme.colorScheme.inverseOnSurface, modifier = Modifier.size(12.dp))
                                        Text(" Main", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.inverseOnSurface)
                                    }
                                }
                                if (canEdit) Box(
                                    Modifier.align(Alignment.TopEnd).padding(4.dp).size(26.dp).clip(CircleShape).background(MaterialTheme.colorScheme.inverseSurface.copy(alpha = 0.75f)).clickable { vm.removeImage(image) },
                                    contentAlignment = Alignment.Center,
                                ) { Icon(Icons.Rounded.Close, "Remove photo", tint = MaterialTheme.colorScheme.inverseOnSurface, modifier = Modifier.size(16.dp)) }
                            }
                        }
                        if (canEdit) item {
                            Box(
                                Modifier.size(104.dp).clip(RoundedCornerShape(16.dp)).border(1.5.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
                                    .clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(Icons.Outlined.AddPhotoAlternate, null, tint = MaterialTheme.colorScheme.primary)
                                    Text("Add photos", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                    if (f.images.size > 1 && canEdit) Text("Tap a photo to make it the main one.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                }

                SectionCard(title = "Details") {
                    Field("Name", f.name, { v -> vm.edit { it.copy(name = v.take(200)) } }, state.errors["name"], canEdit, capitalize = true)
                    if (f.descriptionHasFormatting && !f.descriptionEdited) {
                        Text("Description", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(f.description.take(600) + if (f.description.length > 600) "…" else "", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Info, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("This description has formatting. Edit it on the website to keep it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        }
                        if (canEdit) TextButton(onClick = vm::replaceFormattedDescription) { Text("Replace with plain text") }
                    } else {
                        Field("Description", f.description, { v -> vm.edit { it.copy(description = v.take(20000), descriptionEdited = true) } }, null, canEdit, minLines = 4, capitalize = true)
                    }
                    Field("Short description", f.shortDescription, { v -> vm.edit { it.copy(shortDescription = v.take(1000)) } }, null, canEdit, minLines = 2, capitalize = true)
                }

                SectionCard(title = "Pricing") {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        MoneyField("Price", f.price, { v -> vm.edit { it.copy(price = v) } }, state.errors["price"], canEdit, currency, Modifier.weight(1f))
                        MoneyField("Compare-at", f.compareAt, { v -> vm.edit { it.copy(compareAt = v) } }, state.errors["compareAt"], canEdit, currency, Modifier.weight(1f))
                    }
                    MoneyField("Cost per item (only staff see it)", f.cost, { v -> vm.edit { it.copy(cost = v) } }, state.errors["cost"], canEdit, currency, Modifier.fillMaxWidth())
                    val price = Money.parse(f.price, currency); val cost = Money.parse(f.cost, currency)
                    if (price != null && cost != null && price > 0) {
                        val margin = ((price - cost) * 100.0 / price)
                        Text(String.format(java.util.Locale.US, "Margin %.0f%% · profit %s per item", margin, Money.format(price - cost, currency)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                SectionCard(title = "Visibility") {
                    SegmentedChoice(listOf("ACTIVE" to "Active", "DRAFT" to "Draft", "ARCHIVED" to "Archived"), f.status, { v -> if (canEdit) vm.edit { it.copy(status = v) } })
                    Text(
                        when (f.status) {
                            "ACTIVE" -> "Live in the shop. When it sells out it stays visible with a \"Sold out\" label."
                            "DRAFT" -> "Hidden from shoppers until you activate it."
                            else -> "Archived: hidden and out of the way. Past orders keep it."
                        },
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp),
                    )
                    ToggleRow("Featured on the home page", f.featured, canEdit) { v -> vm.edit { it.copy(featured = v) } }
                }

                SectionCard(title = "Inventory") {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Field("SKU", f.sku, { v -> vm.edit { it.copy(sku = v.take(120)) } }, state.errors["sku"], canEdit, Modifier.weight(1f))
                        Field("Barcode", f.barcode, { v -> vm.edit { it.copy(barcode = v.take(120)) } }, null, canEdit, Modifier.weight(1f))
                    }
                    ToggleRow("Track stock", f.trackInventory, canEdit) { v -> vm.edit { it.copy(trackInventory = v) } }
                    ToggleRow("Keep selling when sold out", f.continueSelling, canEdit) { v -> vm.edit { it.copy(continueSelling = v) } }
                    if (vm.isNew) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Field("Quantity", f.quantity, { v -> vm.edit { it.copy(quantity = v.filter(Char::isDigit).take(7)) } }, state.errors["quantity"], canEdit, Modifier.weight(1f), number = true)
                            Field("Low-stock alert at", f.threshold, { v -> vm.edit { it.copy(threshold = v.filter(Char::isDigit).take(6)) } }, state.errors["threshold"], canEdit, Modifier.weight(1f), number = true)
                        }
                    } else state.original?.let { p ->
                        val rows = p.inventory.map { (p.variants.firstOrNull { v -> v.id == it.variantId }?.name ?: it.location?.name ?: "Stock") to it } +
                            p.variants.flatMap { v -> v.inventory.map { inv -> (v.name + (inv.location?.name?.let { " · $it" } ?: "")) to inv } }
                        HorizontalDivider(Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        rows.forEach { (label, inv) ->
                            val available = inv.quantity - inv.reserved
                            val stateName = if (available <= 0) "out" else if (available <= inv.lowStockThreshold) "low" else "in"
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                Pill(if (available <= 0) "Sold out" else "$available available", stockTone(stateName))
                            }
                        }
                        Text("Change quantities in the Stock tab, so every change is recorded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                        if (p.variants.size > 1) Text("This product has ${p.variants.size} options. Edit options and their prices on the website.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                SectionCard(title = "Organization") {
                    Text("Collections", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                        state.collections.filter { it.id in f.collectionIds }.forEach { Pill(it.name, Tone.Brand) }
                        if (f.collectionIds.isEmpty()) Text("None", style = MaterialTheme.typography.bodyMedium)
                    }
                    if (canEdit) TextButton(onClick = { pickCollections = true }, contentPadding = PaddingValues(0.dp)) { Text("Choose collections") }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Field("Brand", f.brand, { v -> vm.edit { it.copy(brand = v.take(160)) } }, null, canEdit, Modifier.weight(1f), capitalize = true)
                        Field("Type", f.productType, { v -> vm.edit { it.copy(productType = v.take(160)) } }, null, canEdit, Modifier.weight(1f), capitalize = true)
                    }
                    Field("Vendor", f.vendor, { v -> vm.edit { it.copy(vendor = v.take(160)) } }, null, canEdit, capitalize = true)
                    TagsEditor(f.tags, canEdit, vm)
                }
            }
        }
    }
    if (pickCollections) CollectionsDialog(state, vm) { pickCollections = false }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsEditor(tags: List<String>, canEdit: Boolean, vm: ProductEditorViewModel) {
    var input by rememberSaveable { mutableStateOf("") }
    Text("Tags", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        tags.forEach { tag ->
            InputChip(selected = false, onClick = { if (canEdit) vm.edit { it.copy(tags = it.tags - tag) } }, label = { Text(tag) },
                trailingIcon = if (canEdit) ({ Icon(Icons.Rounded.Close, "Remove tag", Modifier.size(16.dp)) }) else null)
        }
    }
    if (canEdit) OutlinedTextField(
        value = input, onValueChange = { input = it.take(80) },
        placeholder = { Text("Add a tag and press enter") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { vm.addTag(input); input = "" }),
    )
}

@Composable
private fun CollectionsDialog(state: ProductEditorViewModel.UiState, vm: ProductEditorViewModel, onDismiss: () -> Unit) {
    var chosen by remember { mutableStateOf(state.form.collectionIds.toSet()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Collections") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (state.collections.isEmpty()) Text("No collections yet. Create them on the website.")
                state.collections.forEach { c ->
                    Row(Modifier.fillMaxWidth().clickable { chosen = if (c.id in chosen) chosen - c.id else chosen + c.id }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = c.id in chosen, onCheckedChange = { chosen = if (it) chosen + c.id else chosen - c.id })
                        Text(c.name + if (!c.isActive) " (hidden)" else "", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { vm.edit { it.copy(collectionIds = chosen.toList()) }; onDismiss() }) { Text("Done") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun Field(
    label: String, value: String, onChange: (String) -> Unit, error: String?, enabled: Boolean,
    modifier: Modifier = Modifier.fillMaxWidth(), minLines: Int = 1, number: Boolean = false, capitalize: Boolean = false,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, enabled = enabled,
        isError = error != null, supportingText = error?.let { { Text(it) } },
        singleLine = minLines == 1, minLines = minLines, modifier = modifier.padding(bottom = 6.dp), shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(
            keyboardType = if (number) KeyboardType.Number else KeyboardType.Text,
            capitalization = if (capitalize) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
        ),
    )
}

@Composable
private fun MoneyField(label: String, value: String, onChange: (String) -> Unit, error: String?, enabled: Boolean, currency: String, modifier: Modifier) {
    OutlinedTextField(
        value = value, onValueChange = { v -> onChange(v.filter { it.isDigit() || it == '.' }.take(12)) }, label = { Text(label) }, enabled = enabled,
        prefix = { Text(Money.symbol(currency) + " ") }, isError = error != null, supportingText = error?.let { { Text(it) } },
        singleLine = true, modifier = modifier.padding(bottom = 6.dp), shape = RoundedCornerShape(14.dp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    )
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

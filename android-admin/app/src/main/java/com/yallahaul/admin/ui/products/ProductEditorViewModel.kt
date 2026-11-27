package com.yallahaul.admin.ui.products

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ProductDraft
import com.yallahaul.admin.core.data.ProductsRepository
import com.yallahaul.admin.core.model.CollectionRow
import com.yallahaul.admin.core.model.ProductDetail
import com.yallahaul.admin.core.model.ProductImage
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.util.Money
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProductEditorViewModel @Inject constructor(
    private val repo: ProductsRepository,
    session: SessionManager,
    saved: SavedStateHandle,
) : ViewModel() {
    private val id: String = checkNotNull(saved["id"])
    val isNew = id == "new"
    private val currency = (session.state.value as? com.yallahaul.admin.core.session.SessionState.SignedIn)?.store?.currency ?: "USD"

    data class Form(
        val name: String = "",
        val sku: String = "",
        val barcode: String = "",
        val description: String = "",
        val descriptionHasFormatting: Boolean = false,
        val descriptionEdited: Boolean = true,
        val shortDescription: String = "",
        val price: String = "",
        val compareAt: String = "",
        val cost: String = "",
        val status: String = "DRAFT",
        val featured: Boolean = false,
        val brand: String = "",
        val vendor: String = "",
        val productType: String = "",
        val tags: List<String> = emptyList(),
        val collectionIds: List<String> = emptyList(),
        val images: List<ProductImage> = emptyList(),
        val trackInventory: Boolean = true,
        val continueSelling: Boolean = false,
        val quantity: String = "0",
        val threshold: String = "5",
    )

    data class UiState(
        val loading: Boolean = true,
        val loadError: AppError? = null,
        val form: Form = Form(),
        val original: ProductDetail? = null,
        val collections: List<CollectionRow> = emptyList(),
        val saving: Boolean = false,
        val uploading: Int = 0,
        val dirty: Boolean = false,
        val errors: Map<String, String> = emptyMap(),
        val saved: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState(loading = !isNew))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()
    val storeCurrency get() = currency

    init {
        viewModelScope.launch { (repo.collections() as? ApiResult.Success)?.let { r -> _state.update { it.copy(collections = r.data.rows) } } }
        if (!isNew) load()
    }

    fun load() {
        _state.update { it.copy(loading = true, loadError = null) }
        viewModelScope.launch {
            when (val result = repo.detail(id)) {
                is ApiResult.Success -> {
                    val p = result.data.product
                    val html = p.description?.contains(Regex("<[a-zA-Z][^>]*>")) == true
                    _state.update {
                        it.copy(
                            loading = false, original = p, dirty = false,
                            form = Form(
                                name = p.name, sku = p.sku, barcode = p.barcode.orEmpty(),
                                description = if (html) stripHtml(p.description.orEmpty()) else p.description.orEmpty(),
                                descriptionHasFormatting = html, descriptionEdited = !html,
                                shortDescription = p.shortDescription.orEmpty(),
                                price = Money.toInput(p.basePrice, currency), compareAt = Money.toInput(p.compareAtPrice, currency), cost = Money.toInput(p.costPrice, currency),
                                status = p.status, featured = p.featured,
                                brand = p.brand.orEmpty(), vendor = p.vendor.orEmpty(), productType = p.productType.orEmpty(),
                                tags = p.tags.map { t -> t.value }, collectionIds = p.collections.mapNotNull { c -> c.collection?.id },
                                images = p.images, trackInventory = p.trackInventory, continueSelling = p.continueSellingWhenOutOfStock,
                            ),
                        )
                    }
                }
                is ApiResult.Failure -> _state.update { it.copy(loading = false, loadError = result.error) }
            }
        }
    }

    fun edit(change: (Form) -> Form) = _state.update { it.copy(form = change(it.form), dirty = true, errors = emptyMap()) }

    fun replaceFormattedDescription() = edit { it.copy(descriptionEdited = true, descriptionHasFormatting = false) }

    fun addTag(tag: String) {
        val clean = tag.trim().take(80)
        if (clean.isEmpty()) return
        edit { if (clean in it.tags) it else it.copy(tags = it.tags + clean) }
    }

    fun removeImage(image: ProductImage) = edit { it.copy(images = it.images - image) }
    fun moveImageFirst(image: ProductImage) = edit { it.copy(images = listOf(image) + (it.images - image)) }

    fun uploadImages(uris: List<Uri>) {
        val room = 20 - _state.value.form.images.size
        if (room <= 0) { viewModelScope.launch { _messages.send("A product can have 20 photos at most.") }; return }
        uris.take(room).forEach { uri ->
            _state.update { it.copy(uploading = it.uploading + 1) }
            viewModelScope.launch {
                when (val result = repo.uploadImage(uri, _state.value.form.name)) {
                    is ApiResult.Success -> edit { it.copy(images = it.images + ProductImage(url = result.data.url, alt = it.name.ifBlank { null })) }
                    is ApiResult.Failure -> _messages.send(result.error.message)
                }
                _state.update { it.copy(uploading = it.uploading - 1) }
            }
        }
    }

    fun save() {
        val s = _state.value
        if (s.saving || s.uploading > 0) return
        val f = s.form
        val errors = mutableMapOf<String, String>()
        if (f.name.isBlank()) errors["name"] = "Give the product a name"
        if (f.sku.isBlank()) errors["sku"] = "A SKU is required"
        val price = Money.parse(f.price, currency)
        if (price == null) errors["price"] = "Enter a price"
        val compare = if (f.compareAt.isBlank()) null else Money.parse(f.compareAt, currency) ?: run { errors["compareAt"] = "Not a valid amount"; null }
        if (compare != null && price != null && compare <= price) errors["compareAt"] = "Must be higher than the price, or empty"
        val cost = if (f.cost.isBlank()) null else Money.parse(f.cost, currency) ?: run { errors["cost"] = "Not a valid amount"; null }
        val quantity = f.quantity.toIntOrNull()
        val threshold = f.threshold.toIntOrNull()
        if (isNew && (quantity == null || quantity < 0)) errors["quantity"] = "Enter 0 or more"
        if (isNew && (threshold == null || threshold < 0)) errors["threshold"] = "Enter 0 or more"
        if (errors.isNotEmpty()) { _state.update { it.copy(errors = errors) }; viewModelScope.launch { _messages.send("Check the highlighted fields") }; return }

        val draft = ProductDraft(
            name = f.name, sku = f.sku, barcode = f.barcode, description = f.description, descriptionEdited = f.descriptionEdited,
            shortDescription = f.shortDescription, basePrice = price, compareAtPrice = compare, costPrice = cost,
            status = f.status, featured = f.featured, brand = f.brand, vendor = f.vendor, productType = f.productType,
            tags = f.tags, collectionIds = f.collectionIds, images = f.images, trackInventory = f.trackInventory,
            continueSelling = f.continueSelling, quantity = quantity ?: 0, lowStockThreshold = threshold ?: 5,
        )
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = if (isNew) repo.create(draft) else repo.update(id, draft, s.original!!)
            when (result) {
                is ApiResult.Success -> {
                    _state.update { it.copy(saving = false, dirty = false, saved = true) }
                    _messages.send(if (isNew) "Product created" else "Changes saved")
                }
                is ApiResult.Failure -> {
                    _state.update { it.copy(saving = false) }
                    _messages.send(result.error.message)
                }
            }
        }
    }

    fun savedHandled() = _state.update { it.copy(saved = false) }

    private fun stripHtml(html: String) = html
        .replace(Regex("(?i)<br\\s*/?>|</p>|</li>|</h[1-6]>"), "\n")
        .replace(Regex("<[^>]+>"), "")
        .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
        .replace(Regex("\n{3,}"), "\n\n").trim()
}

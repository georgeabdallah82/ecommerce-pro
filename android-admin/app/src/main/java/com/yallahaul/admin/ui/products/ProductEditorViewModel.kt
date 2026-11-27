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
        /** The product's options (sizes, colours...), editable when it already has them. */
        val variants: List<VariantForm> = emptyList(),
        val variantsDirty: Boolean = false,
    )

    data class VariantForm(
        val key: String,
        val id: String?,
        val name: String,
        val sku: String,
        val barcode: String,
        val price: String,
        val compareAt: String,
        val original: com.yallahaul.admin.core.model.VariantFull?,
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
            if (_state.value.original?.variants?.isNotEmpty() == true) {
                (repo.variants(id) as? ApiResult.Success)?.let { r ->
                    _state.update { st -> st.copy(variantsDirty = false, variants = r.data.map { v ->
                        VariantForm(v.id, v.id, v.name, v.sku, v.barcode.orEmpty(), Money.toInput(v.price, currency), Money.toInput(v.compareAtPrice, currency), v)
                    }) }
                }
            }
        }
    }

    fun editVariant(key: String, change: (VariantForm) -> VariantForm) = _state.update { s -> s.copy(variants = s.variants.map { if (it.key == key) change(it) else it }, variantsDirty = true, dirty = true, errors = emptyMap()) }
    fun removeVariant(key: String) = _state.update { s -> s.copy(variants = s.variants.filterNot { it.key == key }, variantsDirty = true, dirty = true) }
    fun addVariant() = _state.update { s ->
        val sku = "${s.form.sku}-${s.variants.size + 1}"
        s.copy(variants = s.variants + VariantForm("new-${System.nanoTime()}", null, "", sku, "", s.form.price, "", null), variantsDirty = true, dirty = true)
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
        val variantDrafts = if (!isNew && s.variantsDirty) s.variants.map { v ->
            if (v.name.isBlank()) errors["variant:${v.key}:name"] = "Name it"
            if (v.sku.isBlank()) errors["variant:${v.key}:sku"] = "SKU needed"
            val vp = if (v.price.isBlank()) null else Money.parse(v.price, currency) ?: run { errors["variant:${v.key}:price"] = "Not a valid amount"; null }
            val vc = if (v.compareAt.isBlank()) null else Money.parse(v.compareAt, currency) ?: run { errors["variant:${v.key}:compare"] = "Not a valid amount"; null }
            com.yallahaul.admin.core.data.VariantDraft(v.id, v.name, v.sku, v.barcode, vp, vc, v.original)
        } else null
        if (variantDrafts != null && variantDrafts.isEmpty()) errors["variants"] = "Keep at least one option, or remove options on the website"
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
            var result: ApiResult<*> = if (isNew) repo.create(draft) else repo.update(id, draft, s.original!!)
            // Options are saved after the product, through the same product route, with every option sent.
            if (result is ApiResult.Success && variantDrafts != null) result = repo.saveVariants(id, variantDrafts)
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

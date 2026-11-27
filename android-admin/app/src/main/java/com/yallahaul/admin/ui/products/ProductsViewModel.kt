package com.yallahaul.admin.ui.products

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ProductsRepository
import com.yallahaul.admin.core.model.ProductRow
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.components.Paged
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProductsViewModel @Inject constructor(private val repo: ProductsRepository) : ViewModel() {
    data class UiState(
        val status: String = "ALL",
        val query: String = "",
        val list: Paged<ProductRow> = Paged(),
        val counts: Map<String, Int> = emptyMap(),
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val error: AppError? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val queryFlow = MutableStateFlow("")
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()
    private var job: Job? = null

    init {
        load(true)
        @OptIn(FlowPreview::class)
        viewModelScope.launch { queryFlow.drop(1).debounce(350).distinctUntilChanged().collect { load(true) } }
    }

    fun setStatus(status: String) { if (status != _state.value.status) { _state.update { it.copy(status = status) }; load(true) } }
    fun setQuery(q: String) { _state.update { it.copy(query = q) }; queryFlow.value = q.trim() }
    fun refresh() = load(true, refreshing = true)
    fun loadMore() { if (_state.value.list.canLoadMore && !_state.value.loading) load(false) }

    /** Active <-> draft from the list. Sold-out products are not touched: they stay visible with a "Sold out" label. */
    fun toggleActive(product: ProductRow) {
        val next = if (product.status == "ACTIVE") "DRAFT" else "ACTIVE"
        viewModelScope.launch {
            when (val result = repo.setStatus(product.id, next)) {
                is ApiResult.Success -> {
                    _state.update { s -> s.copy(list = s.list.copy(rows = s.list.rows.map { if (it.id == product.id) it.copy(status = next) else it })) }
                    _messages.send(if (next == "ACTIVE") "\"${product.name}\" is now live in the shop" else "\"${product.name}\" is hidden from the shop")
                }
                is ApiResult.Failure -> _messages.send(result.error.message)
            }
        }
    }

    private fun load(reset: Boolean, refreshing: Boolean = false) {
        job?.cancel()
        val s = _state.value
        val page = if (reset) 1 else s.list.page + 1
        _state.update {
            when {
                refreshing -> it.copy(refreshing = true)
                reset -> it.copy(loading = it.list.rows.isEmpty() || it.error != null, error = null)
                else -> it.copy(list = it.list.copy(loadingMore = true, moreError = null))
            }
        }
        job = viewModelScope.launch {
            when (val result = repo.list(s.status, s.query, page)) {
                is ApiResult.Success -> _state.update {
                    val d = result.data
                    it.copy(
                        loading = false, refreshing = false, error = null, counts = d.counts,
                        list = Paged(if (reset) d.rows else it.list.rows + d.rows.filter { r -> it.list.rows.none { x -> x.id == r.id } }, d.page, d.pages, d.total),
                    )
                }
                is ApiResult.Failure -> _state.update {
                    if (reset && it.list.rows.isEmpty()) it.copy(loading = false, refreshing = false, error = result.error)
                    else it.copy(loading = false, refreshing = false, list = it.list.copy(loadingMore = false, moreError = result.error.message))
                }
            }
        }
    }
}

/** Units available to sell (on hand minus reserved), across variants and locations; null when stock isn't tracked. */
fun ProductRow.available(): Int? {
    if (!trackInventory) return null
    val rows = inventory + variants.flatMap { it.inventory }
    return rows.sumOf { (it.quantity - it.reserved).coerceAtLeast(0) }
}

fun ProductRow.stockState(): String {
    val units = available() ?: return "in"
    val threshold = (inventory + variants.flatMap { it.inventory }).maxOfOrNull { it.lowStockThreshold } ?: 5
    return when {
        units <= 0 -> "out"
        units <= threshold -> "low"
        else -> "in"
    }
}

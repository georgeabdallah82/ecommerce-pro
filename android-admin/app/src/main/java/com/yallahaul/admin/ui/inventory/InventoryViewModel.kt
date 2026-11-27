package com.yallahaul.admin.ui.inventory

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.InventoryRepository
import com.yallahaul.admin.core.model.StockItem
import com.yallahaul.admin.core.model.StockSummary
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
class InventoryViewModel @Inject constructor(private val repo: InventoryRepository, saved: SavedStateHandle) : ViewModel() {
    data class UiState(
        val filter: String = "all",
        val query: String = "",
        val list: Paged<StockItem> = Paged(),
        val summary: StockSummary = StockSummary(),
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val error: AppError? = null,
        val saving: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState(filter = saved.get<String>("filter") ?: "all"))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val queryFlow = MutableStateFlow("")
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()
    private val _adjusted = Channel<String>(Channel.BUFFERED)
    /** The id of a row that was just saved, so the sheet can close. */
    val adjusted = _adjusted.receiveAsFlow()
    private var job: Job? = null
    private val _scanned = Channel<StockItem>(Channel.BUFFERED)
    /** A stock row found by scanning its barcode: the screen opens the adjust sheet for it. */
    val scanned = _scanned.receiveAsFlow()

    /** Finds the stock row for a scanned or typed barcode/SKU (the web's lookup), then loads it with its history. */
    fun findCode(code: String) {
        viewModelScope.launch {
            when (val found = repo.lookup(code)) {
                is ApiResult.Failure -> _messages.send(found.error.message)
                is ApiResult.Success -> {
                    val ids = found.data.items.map { it.id }.toSet()
                    val page = repo.list("all", found.data.sku.ifBlank { code }, 1)
                    val row = (page as? ApiResult.Success)?.data?.items?.firstOrNull { it.id in ids }
                    if (row != null) _scanned.send(row)
                    else _messages.send("${found.data.name}: ${found.data.items.sumOf { it.quantity - it.reserved }} available")
                }
            }
        }
    }

    init {
        load(true)
        @OptIn(FlowPreview::class)
        viewModelScope.launch { queryFlow.drop(1).debounce(350).distinctUntilChanged().collect { load(true) } }
    }

    fun setFilter(filter: String) { if (filter != _state.value.filter) { _state.update { it.copy(filter = filter) }; load(true) } }
    fun setQuery(q: String) { _state.update { it.copy(query = q) }; queryFlow.value = q.trim() }
    fun refresh() = load(true, refreshing = true)
    fun loadMore() { if (_state.value.list.canLoadMore && !_state.value.loading) load(false) }

    /**
     * Saves a stock change through the web's own endpoint, which records the movement, refuses to go
     * below what open orders have reserved, and sends low-stock and back-in-stock alerts.
     */
    fun adjust(item: StockItem, delta: Int, reason: String, damage: Boolean, threshold: Int?) {
        if (_state.value.saving) return
        if (delta == 0 && (threshold == null || threshold == item.lowStockThreshold)) { viewModelScope.launch { _adjusted.send(item.id) }; return }
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            when (val result = repo.adjust(item.id, delta, reason, damage, threshold?.takeIf { it != item.lowStockThreshold })) {
                is ApiResult.Success -> {
                    val newQuantity = item.quantity + delta
                    val available = newQuantity - item.reserved
                    val t = threshold ?: item.lowStockThreshold
                    val updated = item.copy(quantity = newQuantity, available = available, lowStockThreshold = t, state = if (available <= 0) "out" else if (available <= t) "low" else "in")
                    _state.update { s -> s.copy(saving = false, list = s.list.copy(rows = s.list.rows.map { if (it.id == item.id) updated else it })) }
                    _messages.send(if (delta != 0) "Stock for ${item.name} is now $available" else "Low-stock alert saved")
                    _adjusted.send(item.id)
                    load(true, refreshing = true)
                }
                is ApiResult.Failure -> { _state.update { it.copy(saving = false) }; _messages.send(result.error.message) }
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
            when (val result = repo.list(s.filter, s.query, page)) {
                is ApiResult.Success -> _state.update {
                    val d = result.data
                    it.copy(
                        loading = false, refreshing = false, error = null, summary = d.summary,
                        list = Paged(if (reset) d.items else it.list.rows + d.items.filter { r -> it.list.rows.none { x -> x.id == r.id } }, d.page, d.pages, d.total, offlineSince = result.cachedAt),
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

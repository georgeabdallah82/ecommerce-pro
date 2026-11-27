package com.yallahaul.admin.ui.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.OrdersRepository
import com.yallahaul.admin.core.model.OrderRow
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.components.Paged
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val repo: OrdersRepository,
    private val driversRepo: com.yallahaul.admin.core.data.DriversRepository,
    saved: SavedStateHandle,
) : ViewModel() {
    // Selecting several orders: confirm them together, or give them to a driver.
    private val _selected = MutableStateFlow<Set<String>>(emptySet())
    val selected: StateFlow<Set<String>> = _selected.asStateFlow()
    private val _drivers = MutableStateFlow<List<com.yallahaul.admin.core.model.DriverRow>>(emptyList())
    val drivers: StateFlow<List<com.yallahaul.admin.core.model.DriverRow>> = _drivers.asStateFlow()
    private val _working = MutableStateFlow(false)
    val working: StateFlow<Boolean> = _working.asStateFlow()
    private val _messages = kotlinx.coroutines.channels.Channel<String>(kotlinx.coroutines.channels.Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    fun toggle(id: String) = _selected.update { if (id in it) it - id else it + id }
    fun clearSelection() { _selected.value = emptySet() }

    /** Confirms each selected order that is still pending, one at a time, through the usual order route. */
    fun confirmSelected() {
        val rows = _state.value.list.rows.filter { it.id in _selected.value && it.status == "PENDING" }
        if (rows.isEmpty()) { viewModelScope.launch { _messages.send("None of the selected orders is pending") }; return }
        _working.value = true
        viewModelScope.launch {
            var done = 0; var failed = 0
            for (row in rows) { if (repo.setStatus(row.id, "CONFIRMED") is ApiResult.Success) done++ else failed++ }
            _working.value = false
            clearSelection()
            _messages.send("$done order${if (done == 1) "" else "s"} confirmed" + if (failed > 0) ", $failed couldn't be (they may have changed)" else "")
            refresh()
        }
    }

    fun loadDrivers() = viewModelScope.launch {
        (driversRepo.list() as? ApiResult.Success)?.let { r -> _drivers.value = r.data.drivers.filter { it.active } }
    }

    fun assignSelected(driverId: String) {
        val ids = _selected.value.toList()
        if (ids.isEmpty()) return
        _working.value = true
        viewModelScope.launch {
            when (val r = driversRepo.assign(ids, driverId)) {
                is ApiResult.Success -> _messages.send("${r.data.updated} of ${ids.size} given to ${_drivers.value.firstOrNull { it.id == driverId }?.name ?: "the driver"}" + if (r.data.updated < ids.size) " (only orders on their way can be)" else "")
                is ApiResult.Failure -> _messages.send(r.error.message)
            }
            _working.value = false
            clearSelection()
            refresh()
        }
    }
    data class UiState(
        val status: String? = null,
        val query: String = "",
        val list: Paged<OrderRow> = Paged(),
        val counts: Map<String, Int> = emptyMap(),
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val error: AppError? = null,
    )

    private val _state = MutableStateFlow(UiState(status = saved.get<String>("status")))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val queryFlow = MutableStateFlow("")
    private var job: Job? = null

    init {
        load(reset = true)
        @OptIn(FlowPreview::class)
        viewModelScope.launch { queryFlow.drop(1).debounce(350).distinctUntilChanged().collect { load(reset = true) } }
    }

    fun setStatus(status: String?) {
        if (status == _state.value.status) return
        _state.update { it.copy(status = status) }
        load(reset = true)
    }

    fun setQuery(q: String) {
        _state.update { it.copy(query = q) }
        queryFlow.value = q.trim()
    }

    fun refresh() = load(reset = true, refreshing = true)
    fun loadMore() { if (_state.value.list.canLoadMore && !_state.value.loading) load(reset = false) }

    private fun load(reset: Boolean, refreshing: Boolean = false) {
        job?.cancel()
        val current = _state.value
        val page = if (reset) 1 else current.list.page + 1
        _state.update {
            when {
                refreshing -> it.copy(refreshing = true)
                reset -> it.copy(loading = it.list.rows.isEmpty() || it.error != null, error = null)
                else -> it.copy(list = it.list.copy(loadingMore = true, moreError = null))
            }
        }
        job = viewModelScope.launch {
            when (val result = repo.list(current.status, current.query, page)) {
                is ApiResult.Success -> {
                    val data = result.data
                    _state.update {
                        it.copy(
                            loading = false, refreshing = false, error = null,
                            counts = data.counts ?: it.counts,
                            list = Paged(
                                rows = if (reset) data.rows else it.list.rows + data.rows.filter { row -> it.list.rows.none { r -> r.id == row.id } },
                                page = data.pagination.page, pages = data.pagination.pages, total = data.pagination.total,
                                offlineSince = result.cachedAt,
                            ),
                        )
                    }
                }
                is ApiResult.Failure -> _state.update {
                    if (reset && it.list.rows.isEmpty()) it.copy(loading = false, refreshing = false, error = result.error)
                    else it.copy(loading = false, refreshing = false, list = it.list.copy(loadingMore = false, moreError = result.error.message))
                }
            }
        }
    }
}

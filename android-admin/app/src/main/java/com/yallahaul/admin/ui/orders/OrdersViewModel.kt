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
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val repo: OrdersRepository,
    saved: SavedStateHandle,
) : ViewModel() {
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

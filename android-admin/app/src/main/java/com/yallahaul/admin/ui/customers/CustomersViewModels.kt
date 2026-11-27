package com.yallahaul.admin.ui.customers

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.CustomersRepository
import com.yallahaul.admin.core.model.CustomerDetail
import com.yallahaul.admin.core.model.CustomerRow
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.components.LoadState
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
class CustomersViewModel @Inject constructor(private val repo: CustomersRepository) : ViewModel() {
    data class UiState(
        val query: String = "",
        val list: Paged<CustomerRow> = Paged(),
        val active: Int = 0,
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val error: AppError? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val queryFlow = MutableStateFlow("")
    private var job: Job? = null

    init {
        load(true)
        @OptIn(FlowPreview::class)
        viewModelScope.launch { queryFlow.drop(1).debounce(350).distinctUntilChanged().collect { load(true) } }
    }

    fun setQuery(q: String) { _state.update { it.copy(query = q) }; queryFlow.value = q.trim() }
    fun refresh() = load(true, refreshing = true)
    fun loadMore() { if (_state.value.list.canLoadMore && !_state.value.loading) load(false) }

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
            when (val result = repo.list(s.query, page)) {
                is ApiResult.Success -> _state.update {
                    val d = result.data
                    it.copy(loading = false, refreshing = false, error = null, active = d.active,
                        list = Paged(if (reset) d.rows else it.list.rows + d.rows.filter { r -> it.list.rows.none { x -> x.id == r.id } }, d.page, d.pages, d.total))
                }
                is ApiResult.Failure -> _state.update {
                    if (reset && it.list.rows.isEmpty()) it.copy(loading = false, refreshing = false, error = result.error)
                    else it.copy(loading = false, refreshing = false, list = it.list.copy(loadingMore = false, moreError = result.error.message))
                }
            }
        }
    }
}

@HiltViewModel
class CustomerDetailViewModel @Inject constructor(private val repo: CustomersRepository, saved: SavedStateHandle) : ViewModel() {
    private val id: String = checkNotNull(saved["id"])
    private val _state = MutableStateFlow<LoadState<CustomerDetail>>(LoadState.Loading)
    val state: StateFlow<LoadState<CustomerDetail>> = _state.asStateFlow()

    init { load() }

    fun load() {
        val current = _state.value
        if (current is LoadState.Ready) _state.value = current.copy(refreshing = true)
        viewModelScope.launch {
            _state.value = when (val result = repo.detail(id)) {
                is ApiResult.Success -> LoadState.Ready(result.data.customer)
                is ApiResult.Failure -> (_state.value as? LoadState.Ready)?.copy(refreshing = false, refreshError = result.error.message) ?: LoadState.Failed(result.error)
            }
        }
    }
}

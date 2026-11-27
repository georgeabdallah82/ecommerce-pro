package com.yallahaul.admin.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.AlertsRepository
import com.yallahaul.admin.core.data.DashboardRepository
import com.yallahaul.admin.core.model.DashboardResponse
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.ui.components.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repo: DashboardRepository,
    private val alerts: AlertsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<DashboardResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<DashboardResponse>> = _state.asStateFlow()
    private val _range = MutableStateFlow(30)
    val range: StateFlow<Int> = _range.asStateFlow()
    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    init { load() }

    fun setRange(days: Int) {
        if (days == _range.value) return
        _range.value = days
        load()
    }

    fun refresh() = load(refresh = true)

    private fun load(refresh: Boolean = false) {
        val current = _state.value
        if (current is LoadState.Ready) _state.value = current.copy(refreshing = true, refreshError = null)
        else if (!refresh) _state.value = LoadState.Loading
        viewModelScope.launch {
            when (val result = repo.load(_range.value)) {
                is ApiResult.Success -> _state.value = LoadState.Ready(result.data)
                is ApiResult.Failure -> _state.value = when (val prev = _state.value) {
                    is LoadState.Ready -> prev.copy(refreshing = false, refreshError = result.error.message)
                    else -> LoadState.Failed(result.error)
                }
            }
        }
        viewModelScope.launch { (alerts.list() as? ApiResult.Success)?.let { _unread.value = it.data.unread } }
    }
}

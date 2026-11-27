package com.yallahaul.admin.ui.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.OrdersRepository
import com.yallahaul.admin.core.model.OrderDetailResponse
import com.yallahaul.admin.core.model.OrderPatchResponse
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    private val repo: OrdersRepository,
    saved: SavedStateHandle,
) : ViewModel() {
    private val id: String = checkNotNull(saved["id"])
    private val _state = MutableStateFlow<LoadState<OrderDetailResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<OrderDetailResponse>> = _state.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun refresh() = load()

    private fun load() {
        val current = _state.value
        if (current is LoadState.Ready) _state.value = current.copy(refreshing = true, refreshError = null)
        viewModelScope.launch {
            when (val result = repo.detail(id)) {
                is ApiResult.Success -> _state.value = LoadState.Ready(result.data)
                is ApiResult.Failure -> _state.value = (_state.value as? LoadState.Ready)?.copy(refreshing = false, refreshError = result.error.message) ?: LoadState.Failed(result.error)
            }
        }
    }

    fun setStatus(status: String, tracking: OrdersRepository.Tracking? = null) = mutate(
        success = { response -> outcomeMessage(status, response) },
    ) { repo.setStatus(id, status, tracking) }

    fun markPaid() = mutate(success = { "Marked as paid" }) { repo.markPaid(id) }

    fun addNote(note: String) {
        if (note.isBlank()) return
        mutate(success = { "Note added" }) { repo.addNote(id, note.trim()) }
    }

    fun updateTracking(number: String) = mutate(success = { "Tracking number saved" }) { repo.updateTracking(id, number.trim()) }

    private fun outcomeMessage(status: String, response: OrderPatchResponse): String {
        val currency = (state.value as? LoadState.Ready)?.data?.order?.currency ?: "USD"
        val refund = response.cancelRefund
        return when {
            refund != null && refund.pending -> "Order cancelled. A ${Money.format(refund.amount, currency)} refund is being processed."
            refund != null -> "Order cancelled. ${Money.format(refund.amount, currency)} refunded."
            else -> "Order is now ${Labels.orderStatus(status).lowercase()}"
        }
    }

    private fun mutate(success: (OrderPatchResponse) -> String, call: suspend () -> ApiResult<OrderPatchResponse>) {
        if (_busy.value) return
        _busy.value = true
        viewModelScope.launch {
            when (val result = call()) {
                is ApiResult.Success -> { _messages.send(success(result.data)); load() }
                is ApiResult.Failure -> { _messages.send(result.error.message); if (result.error.status == 409 || result.error.status == 502) load() }
            }
            _busy.value = false
        }
    }
}

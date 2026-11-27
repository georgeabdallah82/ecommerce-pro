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
    private val driversRepo: com.yallahaul.admin.core.data.DriversRepository,
    private val returnsRepo: com.yallahaul.admin.core.data.ReturnsRepository,
    saved: SavedStateHandle,
) : ViewModel() {
    private val _drivers = MutableStateFlow<List<com.yallahaul.admin.core.model.DriverRow>>(emptyList())
    val drivers: StateFlow<List<com.yallahaul.admin.core.model.DriverRow>> = _drivers.asStateFlow()
    /** Set when a refund needs the person to confirm it is them first; the screen asks, then calls [confirmAndRefund]. */
    private val _needsConfirm = MutableStateFlow<Pair<Long, String>?>(null)
    val needsConfirm: StateFlow<Pair<Long, String>?> = _needsConfirm.asStateFlow()
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
                is ApiResult.Success -> _state.value = LoadState.Ready(result.data, offlineSince = result.cachedAt)
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

    fun recordWhatsapp(outcome: String, detail: String) = mutate(success = { "Saved on the order" }) {
        when (val r = repo.recordWhatsapp(id, outcome, detail)) {
            is ApiResult.Success -> ApiResult.Success(OrderPatchResponse())
            is ApiResult.Failure -> r
        }
    }

    fun loadDrivers() = viewModelScope.launch {
        (driversRepo.list() as? ApiResult.Success)?.let { r -> _drivers.value = r.data.drivers.filter { it.active } }
    }

    fun assignDriver(driverId: String?) = mutate(success = { if (driverId == null) "Driver removed" else "Given to ${_drivers.value.firstOrNull { it.id == driverId }?.name ?: "the driver"}" }) {
        when (val r = driversRepo.assign(listOf(id), driverId)) {
            is ApiResult.Success -> if (r.data.updated > 0) ApiResult.Success(OrderPatchResponse()) else ApiResult.Failure(com.yallahaul.admin.core.network.AppError(com.yallahaul.admin.core.network.AppError.Kind.Validation, "Only orders on their way can be given to a driver."))
            is ApiResult.Failure -> r
        }
    }

    fun createReturn(lines: List<com.yallahaul.admin.core.model.ReturnLine>, restock: Boolean, refund: Long, reason: String) = mutate(success = { "Return recorded" + if (refund > 0) " with a refund" else "" }) {
        when (val r = returnsRepo.create(com.yallahaul.admin.core.model.ReturnCreate(id, lines, restock, refund, reason.ifBlank { "Customer return" }))) {
            is ApiResult.Success -> ApiResult.Success(OrderPatchResponse())
            is ApiResult.Failure -> r
        }
    }

    /** A refund: asks the screen for the password or 2-step code first unless confirmed in the last minutes. */
    fun refund(amount: Long, reason: String) {
        if (!returnsRepo.hasRecentConfirmation) { _needsConfirm.value = amount to reason; return }
        doRefund(amount, reason)
    }

    fun confirmAndRefund(password: String?, code: String?) {
        val pending = _needsConfirm.value ?: return
        if (_busy.value) return
        _busy.value = true
        viewModelScope.launch {
            when (val r = returnsRepo.confirm(password, code)) {
                is ApiResult.Success -> { _needsConfirm.value = null; _busy.value = false; doRefund(pending.first, pending.second) }
                is ApiResult.Failure -> { _messages.send(r.error.message); _busy.value = false }
            }
        }
    }

    fun cancelConfirm() { _needsConfirm.value = null }

    private fun doRefund(amount: Long, reason: String) = mutate(success = { "Refund recorded" }) {
        when (val r = returnsRepo.refund(id, amount, reason.ifBlank { "Refund from the app" })) {
            is ApiResult.Success -> ApiResult.Success(OrderPatchResponse())
            is ApiResult.Failure -> {
                if (r.error.code == "REAUTH_REQUIRED") _needsConfirm.value = amount to reason
                r
            }
        }
    }

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

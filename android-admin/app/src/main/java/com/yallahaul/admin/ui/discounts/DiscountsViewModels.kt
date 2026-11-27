package com.yallahaul.admin.ui.discounts

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.CouponDraft
import com.yallahaul.admin.core.data.DiscountsRepository
import com.yallahaul.admin.core.model.Coupon
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.session.SessionState
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.security.SecureRandom
import java.time.Instant
import javax.inject.Inject

/** Where a discount stands right now. */
enum class CouponState { Active, Scheduled, Expired, UsedUp, Off }

fun Coupon.state(now: Instant = Instant.now()): CouponState = when {
    !isActive -> CouponState.Off
    Dates.parse(expiresAt)?.isBefore(now) == true -> CouponState.Expired
    maxUses != null && usedCount >= maxUses -> CouponState.UsedUp
    Dates.parse(startsAt)?.isAfter(now) == true -> CouponState.Scheduled
    else -> CouponState.Active
}

fun Coupon.summary(currency: String): String = when (type) {
    "PERCENTAGE" -> "$value% off"
    "FIXED" -> "${Money.format(value, currency)} off"
    "FREE_SHIPPING" -> "Free delivery"
    "BUY_X_GET_Y" -> "Buy ${buyQuantity ?: "?"}, get ${getQuantity ?: "?"}" + (getDiscountPercent?.let { if (it >= 100) " free" else " $it% off" } ?: "")
    else -> type
} + (minSubtotal?.let { " · min ${Money.format(it, currency)}" } ?: "") + if (appliesTo != "ALL_PRODUCTS") " · selected items" else ""

@HiltViewModel
class DiscountsViewModel @Inject constructor(private val repo: DiscountsRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<Coupon>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<Coupon>>> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        val current = _state.value
        if (current is LoadState.Ready) _state.value = current.copy(refreshing = true)
        viewModelScope.launch {
            _state.value = when (val result = repo.list()) {
                is ApiResult.Success -> LoadState.Ready(result.data)
                is ApiResult.Failure -> (_state.value as? LoadState.Ready)?.copy(refreshing = false, refreshError = result.error.message) ?: LoadState.Failed(result.error)
            }
        }
    }

    fun setActive(coupon: Coupon, active: Boolean) {
        replace(coupon.copy(isActive = active))
        viewModelScope.launch {
            when (val result = repo.setActive(coupon.id, active)) {
                is ApiResult.Success -> _messages.send(if (active) "${coupon.code} is on" else "${coupon.code} is off")
                is ApiResult.Failure -> { replace(coupon); _messages.send(result.error.message) }
            }
        }
    }

    private fun replace(coupon: Coupon) {
        val s = _state.value as? LoadState.Ready ?: return
        _state.value = s.copy(data = s.data.map { if (it.id == coupon.id) coupon else it })
    }
}

@HiltViewModel
class DiscountEditorViewModel @Inject constructor(
    private val repo: DiscountsRepository,
    session: SessionManager,
    saved: SavedStateHandle,
) : ViewModel() {
    private val id: String = checkNotNull(saved["id"])
    val isNew = id == "new"
    val currency = (session.state.value as? SessionState.SignedIn)?.store?.currency ?: "USD"

    data class Form(
        val code: String = "",
        val type: String = "PERCENTAGE",
        val value: String = "10",
        val isAutomatic: Boolean = false,
        val minSubtotal: String = "",
        val maxUses: String = "",
        val startsAt: Instant? = null,
        val expiresAt: Instant? = null,
        val firstOrderOnly: Boolean = false,
        val oncePerCustomer: Boolean = false,
        val isActive: Boolean = true,
    )

    data class UiState(
        val loading: Boolean = false,
        val loadError: AppError? = null,
        val original: Coupon? = null,
        val form: Form = Form(),
        val errors: Map<String, String> = emptyMap(),
        val saving: Boolean = false,
        val done: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState(loading = !isNew, form = Form(code = randomCode())))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { if (!isNew) load() }

    fun load() {
        _state.update { it.copy(loading = true, loadError = null) }
        viewModelScope.launch {
            when (val result = repo.list()) {
                is ApiResult.Success -> {
                    val c = result.data.firstOrNull { it.id == id }
                    if (c == null) _state.update { it.copy(loading = false, loadError = AppError(AppError.Kind.NotFound, "This discount no longer exists.")) }
                    else _state.update {
                        it.copy(loading = false, original = c, form = Form(
                            code = c.code, type = c.type,
                            value = if (c.type == "FIXED") Money.toInput(c.value, currency) else c.value.toString(),
                            isAutomatic = c.isAutomatic, minSubtotal = Money.toInput(c.minSubtotal, currency), maxUses = c.maxUses?.toString() ?: "",
                            startsAt = Dates.parse(c.startsAt), expiresAt = Dates.parse(c.expiresAt),
                            firstOrderOnly = c.firstOrderOnly, oncePerCustomer = c.oncePerCustomer, isActive = c.isActive,
                        ))
                    }
                }
                is ApiResult.Failure -> _state.update { it.copy(loading = false, loadError = result.error) }
            }
        }
    }

    fun edit(change: (Form) -> Form) = _state.update { it.copy(form = change(it.form), errors = emptyMap()) }
    fun regenerateCode() = edit { it.copy(code = randomCode()) }

    fun save() {
        val s = _state.value
        if (s.saving) return
        val f = s.form
        val errors = mutableMapOf<String, String>()
        val code = f.code.trim().uppercase()
        if (code.isEmpty()) errors["code"] = "Enter a code"
        else if (!Regex("^[A-Z0-9_-]{2,64}$").matches(code)) errors["code"] = "Letters, numbers, - and _ only"
        val value: Long = when (f.type) {
            "PERCENTAGE" -> f.value.toLongOrNull()?.takeIf { it in 1..100 } ?: run { errors["value"] = "Between 1 and 100"; 0 }
            "FIXED" -> Money.parse(f.value, currency)?.takeIf { it > 0 } ?: run { errors["value"] = "Enter an amount"; 0 }
            else -> s.original?.value ?: 0
        }
        val min = if (f.minSubtotal.isBlank()) null else Money.parse(f.minSubtotal, currency) ?: run { errors["min"] = "Not a valid amount"; null }
        val maxUses = if (f.maxUses.isBlank()) null else f.maxUses.toIntOrNull()?.takeIf { it > 0 } ?: run { errors["maxUses"] = "A whole number above 0"; null }
        if (f.startsAt != null && f.expiresAt != null && !f.expiresAt.isAfter(f.startsAt)) errors["expires"] = "Must end after it starts"
        if (errors.isNotEmpty()) { _state.update { it.copy(errors = errors) }; return }
        val draft = CouponDraft(
            code = code, type = f.type, value = value, isAutomatic = f.isAutomatic, minSubtotal = min, maxUses = maxUses,
            startsAt = f.startsAt?.toString(), expiresAt = f.expiresAt?.toString(),
            firstOrderOnly = f.firstOrderOnly, oncePerCustomer = f.oncePerCustomer, isActive = f.isActive,
        )
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = if (isNew) repo.create(draft) else repo.update(s.original!!, draft)
            when (result) {
                is ApiResult.Success -> { _messages.send(if (isNew) "Discount $code created" else "Discount saved"); _state.update { it.copy(saving = false, done = true) } }
                is ApiResult.Failure -> { _state.update { it.copy(saving = false) }; _messages.send(result.error.message) }
            }
        }
    }

    fun delete() {
        val original = _state.value.original ?: return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            when (val result = repo.delete(original.id)) {
                is ApiResult.Success -> { _messages.send("${original.code} deleted"); _state.update { it.copy(saving = false, done = true) } }
                is ApiResult.Failure -> { _state.update { it.copy(saving = false) }; _messages.send(result.error.message) }
            }
        }
    }

    private fun randomCode(): String {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val random = SecureRandom()
        return "YALLA" + (1..5).map { alphabet[random.nextInt(alphabet.length)] }.joinToString("")
    }
}

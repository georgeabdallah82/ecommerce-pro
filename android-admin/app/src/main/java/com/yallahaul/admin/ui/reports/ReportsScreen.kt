package com.yallahaul.admin.ui.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ReportsRepository
import com.yallahaul.admin.core.model.ProfitResponse
import com.yallahaul.admin.core.model.SalesReport
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LabeledValue
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalStore
import com.yallahaul.admin.ui.components.OfflineBanner
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.components.ShareBar
import com.yallahaul.admin.ui.theme.AppTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class Reports(val sales: SalesReport, val profit: ProfitResponse?)

/** Sales and profit for a period: the web's Reports and Reports › Profit, read-only on the phone. */
@HiltViewModel
class ReportsViewModel @Inject constructor(private val repo: ReportsRepository) : ViewModel() {
    private val _days = MutableStateFlow(30)
    val days: StateFlow<Int> = _days.asStateFlow()
    private val _state = MutableStateFlow<LoadState<Reports>>(LoadState.Loading)
    val state: StateFlow<LoadState<Reports>> = _state.asStateFlow()

    init { load() }

    fun setDays(d: Int) { if (d != _days.value) { _days.value = d; _state.value = LoadState.Loading; load() } }

    fun load() = viewModelScope.launch {
        (_state.value as? LoadState.Ready)?.let { _state.value = it.copy(refreshing = true) }
        val d = _days.value
        val sales = async { repo.sales(d) }
        val profit = async { repo.profit(d) }
        val s = sales.await(); val p = profit.await()
        _state.value = when (s) {
            is ApiResult.Success -> LoadState.Ready(Reports(s.data, (p as? ApiResult.Success)?.data), offlineSince = s.cachedAt)
            is ApiResult.Failure -> LoadState.Failed(s.error)
        }
    }
}

@Composable
fun ReportsScreen(onBack: () -> Unit, vm: ReportsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val days by vm.days.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Reports") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
            SegmentedChoice(listOf("7" to "7 days", "30" to "30 days", "90" to "90 days", "365" to "Year"), days.toString(), { vm.setDays(it.toInt()) })
        }
        OfflineBanner((state as? LoadState.Ready)?.offlineSince, Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) { vm.load() }
        when (val s = state) {
            is LoadState.Loading -> LoadingView()
            is LoadState.Failed -> ErrorView(s.error, { vm.load() })
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                ReportsContent(s.data)
            }
        }
    }
}

@Composable
private fun ReportsContent(r: Reports) {
    val currency = r.profit?.report?.currency ?: LocalStore.current.currency
    val m = { v: Long -> Money.format(v, currency) }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            ConstrainedColumn {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Tile("Sales", m(r.sales.revenue), Modifier.weight(1f))
                    Tile("Orders", r.sales.orders.toString(), Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Tile("Average order", m(r.sales.averageOrderValue), Modifier.weight(1f))
                    Tile("Items sold", r.sales.itemsSold.toString(), Modifier.weight(1f))
                    Tile("New customers", r.sales.newCustomers.toString(), Modifier.weight(1f))
                }
            }
        }
        r.profit?.report?.let { p ->
            item {
                ConstrainedColumn {
                    SectionCard(title = "Profit") {
                        Text(m(p.profit.collectedSoFar), style = MaterialTheme.typography.headlineMedium, color = if (p.profit.collectedSoFar >= 0) AppTheme.status.success else AppTheme.status.danger)
                        Text("made so far from money collected", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (p.profit.ifUnpaidCollected != p.profit.collectedSoFar) Text("${m(p.profit.ifUnpaidCollected)} once unpaid orders are collected", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        HorizontalDivider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        LabeledValue("Net sales", m(p.netSales))
                        LabeledValue("Products' cost", (if (p.productCost.total > 0) "−" else "") + m(p.productCost.total))
                        if (p.delivery.total > 0) LabeledValue("Delivery costs", "−" + m(p.delivery.total))
                        if (p.packaging.total > 0) LabeledValue("Packaging", "−" + m(p.packaging.total))
                        if (p.adSpend.total > 0) LabeledValue("Ads", "−" + m(p.adSpend.total))
                        if (p.expenses.total > 0) LabeledValue("Running costs", "−" + m(p.expenses.total))
                        if (p.refunded > 0) LabeledValue("Refunded", m(p.refunded))
                        if (p.cancelled.orders > 0) LabeledValue("Cancelled", "${p.cancelled.orders} · ${m(p.cancelled.value)}")
                        if (p.estimated || p.productCost.missingSales > 0) Text("An estimate: some products have no cost price. Add it on the product (Cost per item) for exact profit.", style = MaterialTheme.typography.bodySmall, color = AppTheme.status.warning, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            val top = p.byProduct.take(10)
            if (top.isNotEmpty()) item {
                ConstrainedColumn {
                    SectionCard(title = "Products") {
                        val maxSales = top.maxOf { it.sales }.coerceAtLeast(1)
                        top.forEachIndexed { i, prod ->
                            Column(Modifier.padding(vertical = 6.dp)) {
                                Row {
                                    Text(prod.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Text(m(prod.sales), style = MaterialTheme.typography.titleSmall)
                                }
                                Spacer(Modifier.height(4.dp))
                                ShareBar(prod.sales.toFloat() / maxSales, color = AppTheme.status.chart[i % AppTheme.status.chart.size])
                                Text(
                                    "${prod.units} sold" + (prod.profit?.let { " · profit ${m(it)}" } ?: " · no cost price") + (prod.margin?.let { " · ${it}% margin" } ?: ""),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp),
                                )
                            }
                        }
                    }
                }
            }
            if (p.adSpend.byPlatform.isNotEmpty()) item {
                ConstrainedColumn {
                    SectionCard(title = "Ad spend") {
                        p.adSpend.byPlatform.forEach { LabeledValue(it.platform.replaceFirstChar { c -> c.uppercase() }, m(it.total)) }
                        if (p.adSpend.total > 0 && p.netSales > 0) Text("Every ${Money.format(100, currency)} on ads brought ${Money.format(p.netSales * 100 / p.adSpend.total, currency)} in sales", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (r.profit == null) item { Text("Profit isn't available for your account.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun Tile(label: String, value: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

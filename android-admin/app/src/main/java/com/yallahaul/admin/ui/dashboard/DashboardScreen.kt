package com.yallahaul.admin.ui.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.DashboardResponse
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import com.yallahaul.admin.ui.components.AreaChart
import com.yallahaul.admin.ui.components.BarChart
import com.yallahaul.admin.ui.components.ChartPoint
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.DonutChart
import com.yallahaul.admin.ui.components.DonutSlice
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.IconBadge
import com.yallahaul.admin.ui.components.InlineError
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.components.ShareBar
import com.yallahaul.admin.ui.components.SkeletonBlock
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.components.orderTone
import com.yallahaul.admin.ui.components.stockTone
import com.yallahaul.admin.ui.navigation.Routes
import com.yallahaul.admin.ui.theme.AppTheme
import java.time.LocalTime

@Composable
fun DashboardScreen(user: AppUser, padding: PaddingValues, open: (String) -> Unit, vm: DashboardViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val range by vm.range.collectAsStateWithLifecycle()
    val unread by vm.unread.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().padding(padding)) {
        DashboardHeader(user, unread, onAlerts = { open(Routes.ALERTS) })
        when (val s = state) {
            is LoadState.Loading -> DashboardSkeleton()
            is LoadState.Failed -> ErrorView(s.error, onRetry = vm::refresh)
            is LoadState.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                DashboardContent(s.data, range, s.refreshError, user, vm::setRange, vm::refresh, open)
            }
        }
    }
}

@Composable
private fun DashboardHeader(user: AppUser, unread: Int, onAlerts: () -> Unit) {
    val greeting = when (LocalTime.now().hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }
    ConstrainedColumn(Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(greeting + ",", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(user.name.substringBefore(' ').ifBlank { "there" }, style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconButton(onClick = onAlerts) {
                BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                    Icon(Icons.Outlined.Notifications, "Alerts")
                }
            }
        }
    }
}

@Composable
private fun DashboardContent(
    data: DashboardResponse,
    range: Int,
    refreshError: String?,
    user: AppUser,
    onRange: (Int) -> Unit,
    onRetry: () -> Unit,
    open: (String) -> Unit,
) {
    val currency = data.currency
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (refreshError != null) item { ConstrainedColumn { InlineError(refreshError, onRetry) } }
        item { ConstrainedColumn { RevenueHero(data, range, onRange) } }
        item {
            ConstrainedColumn {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    KpiCard("Today", Money.format(data.revenue.today, currency), "${data.orders.today} order${if (data.orders.today == 1) "" else "s"}", Icons.Outlined.Today, Tone.Brand, Modifier.weight(1f), trend = trend(data.revenue.today, data.revenue.yesterday), trendLabel = "vs yesterday")
                    KpiCard("All-time sales", Money.format(data.revenue.total, currency, compact = true), "Avg ${Money.format(data.revenue.averageOrder, currency)}", Icons.Outlined.AccountBalanceWallet, Tone.Success, Modifier.weight(1f))
                }
            }
        }
        item {
            ConstrainedColumn {
                SectionCard(title = "Orders", action = { if (user.can("orders.view")) TextButton(onClick = { open(Routes.ORDERS) }) { Text("View all") } }) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatusTile("Pending", data.orders.pending, Icons.Outlined.HourglassTop, Tone.Warning, Modifier.weight(1f)) { open(Routes.ordersWith("PENDING")) }
                        StatusTile("Processing", data.orders.processing, Icons.Outlined.Inventory2, Tone.Info, Modifier.weight(1f)) { open(Routes.ordersWith("CONFIRMED,PROCESSING")) }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatusTile("Completed", data.orders.completed, Icons.Outlined.CheckCircle, Tone.Success, Modifier.weight(1f)) { open(Routes.ordersWith("DELIVERED")) }
                        StatusTile("Cancelled", data.orders.cancelled, Icons.Outlined.Cancel, Tone.Neutral, Modifier.weight(1f)) { open(Routes.ordersWith("CANCELLED")) }
                    }
                    Spacer(Modifier.height(18.dp))
                    val colors = AppTheme.status
                    DonutChart(
                        slices = listOf(
                            DonutSlice("Pending", data.orders.pending, colors.warning),
                            DonutSlice("Processing", data.orders.processing, colors.info),
                            DonutSlice("Out for delivery", data.orders.shipped, MaterialTheme.colorScheme.primary),
                            DonutSlice("Delivered", data.orders.completed, colors.success),
                            DonutSlice("Cancelled", data.orders.cancelled + data.orders.refunded, colors.neutral),
                        ),
                        centerTop = data.orders.total.toString(),
                        centerBottom = "total orders",
                    )
                }
            }
        }
        if (data.attention.paymentProofsWaiting > 0 || data.attention.pendingReviews > 0) {
            item {
                ConstrainedColumn {
                    SectionCard(title = "Needs your attention", contentPadding = PaddingValues(vertical = 8.dp, horizontal = 4.dp)) {
                        if (data.attention.paymentProofsWaiting > 0) AttentionRow(Icons.Outlined.Payments, Tone.Warning, "${data.attention.paymentProofsWaiting} payment screenshot${if (data.attention.paymentProofsWaiting == 1) "" else "s"} to check", "Check the transfer, then mark the order as paid") { open(Routes.ordersWith("PENDING,CONFIRMED,PROCESSING")) }
                        if (data.attention.pendingReviews > 0) AttentionRow(Icons.Outlined.RateReview, Tone.Info, "${data.attention.pendingReviews} review${if (data.attention.pendingReviews == 1) "" else "s"} waiting", "Approve reviews in the web admin", null)
                    }
                }
            }
        }
        if (data.lowStock.count > 0) item { ConstrainedColumn { LowStockCard(data, open, user.can("inventory.view")) } }
        if (data.bestSellers.isNotEmpty()) item { ConstrainedColumn { BestSellersCard(data, open, user.can("products.view")) } }
        if (data.recentOrders.isNotEmpty()) item { ConstrainedColumn { RecentOrdersCard(data, open, user.can("orders.view")) } }
        item {
            Text(
                "Updated ${Dates.relative(data.generatedAt).lowercase()} · store time ${data.timezone}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

private fun trend(now: Long, before: Long): Float? = if (before <= 0L) null else ((now - before).toFloat() / before) * 100f

@Composable
private fun RevenueHero(data: DashboardResponse, range: Int, onRange: (Int) -> Unit) {
    var selected by remember(data) { mutableStateOf<Int?>(null) }
    val points = data.daily.map { ChartPoint(it.day, it.net.toFloat(), it.orders.toFloat()) }
    val sel = selected?.let { data.daily.getOrNull(it) }
    val change = trend(data.revenue.range, data.revenue.previousRange)
    Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (sel != null) Dates.dayLabel(sel.day) else "Sales · last $range days", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                SegmentedChoice(listOf("7" to "7D", "30" to "30D", "90" to "90D"), range.toString(), { onRange(it.toInt()) })
            }
            Spacer(Modifier.height(10.dp))
            Text(Money.format(sel?.net ?: data.revenue.range, data.currency), style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (sel != null) {
                    Text("${sel.orders} order${if (sel.orders == 1) "" else "s"}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    if (change != null) {
                        val up = change >= 0
                        Pill(String.format(java.util.Locale.US, "%s%.1f%%", if (up) "+" else "", change), if (up) Tone.Success else Tone.Danger, icon = if (up) Icons.AutoMirrored.Rounded.TrendingUp else Icons.AutoMirrored.Rounded.TrendingDown)
                        Spacer(Modifier.width(8.dp))
                        Text("vs previous $range days", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        Text("${data.orders.range} orders in this period", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
            AreaChart(points, onSelect = { selected = it }, description = "Sales for the last $range days")
            Spacer(Modifier.height(10.dp))
            BarChart(points.map { it.copy(value = it.secondary) }, height = 36.dp, highlight = selected)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                Text(data.daily.firstOrNull()?.let { Dates.shortDay(it.day) } ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text("Orders per day", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(data.daily.lastOrNull()?.let { Dates.shortDay(it.day) } ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            }
        }
    }
}

@Composable
private fun KpiCard(label: String, value: String, caption: String, icon: ImageVector, tone: Tone, modifier: Modifier, trend: Float? = null, trendLabel: String? = null) {
    Surface(modifier, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp)) {
            IconBadge(icon, tone, size = 36.dp)
            Spacer(Modifier.height(14.dp))
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            if (trend != null) {
                val up = trend >= 0
                Text(
                    String.format(java.util.Locale.US, "%s%.0f%% %s", if (up) "▲ " else "▼ ", kotlin.math.abs(trend), trendLabel ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (up) AppTheme.status.success else AppTheme.status.danger,
                )
            }
            Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun StatusTile(label: String, count: Int, icon: ImageVector, tone: Tone, modifier: Modifier, onClick: () -> Unit) {
    val (bg, fg) = com.yallahaul.admin.ui.components.toneColors(tone)
    Surface(modifier.clickable(onClick = onClick), shape = MaterialTheme.shapes.medium, color = bg.copy(alpha = 0.55f)) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(count.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun AttentionRow(icon: ImageVector, tone: Tone, title: String, subtitle: String, onClick: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconBadge(icon, tone)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (onClick != null) Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LowStockCard(data: DashboardResponse, open: (String) -> Unit, canOpen: Boolean) {
    SectionCard(
        title = "Low stock",
        action = { if (canOpen) TextButton(onClick = { open(Routes.inventoryWith("low")) }) { Text("Manage") } },
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("${data.lowStock.count} running low", Tone.Warning, icon = Icons.Outlined.WarningAmber)
            if (data.lowStock.outOfStock > 0) Pill("${data.lowStock.outOfStock} sold out", Tone.Danger)
        }
        Spacer(Modifier.height(8.dp))
        data.lowStock.items.forEachIndexed { index, item ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                RemoteImage(item.imageUrl, item.name, size = 40.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(item.variant ?: "Alert at ${item.threshold}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                Pill(if (item.available <= 0) "Sold out" else "${item.available} left", stockTone(if (item.available <= 0) "out" else "low"))
            }
        }
    }
}

@Composable
private fun BestSellersCard(data: DashboardResponse, open: (String) -> Unit, canOpen: Boolean) {
    val top = data.bestSellers.maxOfOrNull { it.sold }?.coerceAtLeast(1) ?: 1
    SectionCard(title = "Best sellers · 30 days") {
        data.bestSellers.forEachIndexed { index, item ->
            Row(
                Modifier.fillMaxWidth().then(if (canOpen) Modifier.clickable { open(Routes.product(item.productId)) } else Modifier).padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${index + 1}", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(20.dp))
                RemoteImage(item.imageUrl, item.name, size = 44.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(6.dp))
                    ShareBar(item.sold.toFloat() / top, color = AppTheme.status.chart[index % AppTheme.status.chart.size])
                }
                Spacer(Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text("${item.sold} sold", style = MaterialTheme.typography.titleSmall)
                    Text(Money.format(item.revenue, data.currency, compact = true), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun RecentOrdersCard(data: DashboardResponse, open: (String) -> Unit, canOpen: Boolean) {
    SectionCard(title = "Recent orders", contentPadding = PaddingValues(top = 16.dp, bottom = 6.dp), action = { if (canOpen) TextButton(onClick = { open(Routes.ORDERS) }, modifier = Modifier.padding(end = 8.dp)) { Text("All orders") } }) {
        data.recentOrders.forEachIndexed { index, order ->
            if (index > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                Modifier.fillMaxWidth().then(if (canOpen) Modifier.clickable { open(Routes.order(order.id)) } else Modifier).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconBadge(Icons.AutoMirrored.Outlined.ReceiptLong, orderTone(order.status), size = 38.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("#${order.orderNumber} · ${order.customer}", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${Dates.relative(order.createdAt)} · ${order.itemCount} item${if (order.itemCount == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(Money.format(order.grandTotal, order.currency), style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(4.dp))
                    Pill(Labels.orderStatus(order.status), orderTone(order.status))
                }
            }
        }
    }
}

@Composable
private fun DashboardSkeleton() {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SkeletonBlock(Modifier.fillMaxWidth().height(320.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(28.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SkeletonBlock(Modifier.weight(1f).height(150.dp))
            SkeletonBlock(Modifier.weight(1f).height(150.dp))
        }
        SkeletonBlock(Modifier.fillMaxWidth().height(260.dp))
    }
}

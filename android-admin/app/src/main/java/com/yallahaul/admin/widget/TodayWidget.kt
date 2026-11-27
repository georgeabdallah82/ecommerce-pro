package com.yallahaul.admin.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.yallahaul.admin.MainActivity
import com.yallahaul.admin.core.model.DashboardResponse
import com.yallahaul.admin.core.util.Money
import kotlinx.coroutines.flow.first

private val Context.widgetStore by preferencesDataStore(name = "yallahaul_widget")

/** What the home-screen widget shows. Only totals: no customer names or details. */
data class WidgetData(val revenue: String, val orders: Int, val pending: Int, val lowStock: Int, val updated: String)

object WidgetStore {
    private val revenue = stringPreferencesKey("revenue")
    private val orders = intPreferencesKey("orders")
    private val pending = intPreferencesKey("pending")
    private val lowStock = intPreferencesKey("low_stock")
    private val updated = stringPreferencesKey("updated")

    suspend fun save(context: Context, d: DashboardResponse) {
        context.widgetStore.edit {
            it[revenue] = Money.format(d.revenue.today, d.currency)
            it[orders] = d.orders.today
            it[pending] = d.orders.pending
            it[lowStock] = d.lowStock.count
            it[updated] = java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US))
        }
        TodayWidget().updateAll(context)
    }

    suspend fun clear(context: Context) {
        context.widgetStore.edit { it.clear() }
        TodayWidget().updateAll(context)
    }

    suspend fun read(context: Context): WidgetData? {
        val p = context.widgetStore.data.first()
        val r = p[revenue] ?: return null
        return WidgetData(r, p[orders] ?: 0, p[pending] ?: 0, p[lowStock] ?: 0, p[updated] ?: "")
    }
}

/** "Today" on the home screen: today's sales, orders, orders waiting and low stock. Tap to open the app. */
class TodayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetStore.read(context)
        provideContent { Content(data) }
    }

    @Composable
    private fun Content(data: WidgetData?) {
        val red = ColorProvider(Color(0xFFD7261E))
        val ink = ColorProvider(Color(0xFF121212))
        val muted = ColorProvider(Color(0xFF5B616B))
        Column(
            GlanceModifier.fillMaxSize().background(Color.White).cornerRadius(22.dp).padding(14.dp).clickable(actionStartActivity<MainActivity>()),
            verticalAlignment = Alignment.Vertical.Top,
        ) {
            Text("YALLA HAUL · TODAY", style = TextStyle(color = red, fontSize = 11.sp, fontWeight = FontWeight.Bold))
            Spacer(GlanceModifier.height(6.dp))
            if (data == null) {
                Text("Open the app to sign in", style = TextStyle(color = muted, fontSize = 13.sp))
            } else {
                Text(data.revenue, style = TextStyle(color = ink, fontSize = 26.sp, fontWeight = FontWeight.Bold))
                Text("${data.orders} order${if (data.orders == 1) "" else "s"} today", style = TextStyle(color = muted, fontSize = 12.sp))
                Spacer(GlanceModifier.height(8.dp))
                Row {
                    Stat("${data.pending}", "pending", ink, muted)
                    Spacer(GlanceModifier.width(14.dp))
                    Stat("${data.lowStock}", "low stock", ink, muted)
                }
                Spacer(GlanceModifier.height(4.dp))
                Text("Updated ${data.updated}", style = TextStyle(color = muted, fontSize = 10.sp))
            }
        }
    }

    @Composable
    private fun Stat(value: String, label: String, ink: ColorProvider, muted: ColorProvider) {
        Column {
            Text(value, style = TextStyle(color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold))
            Text(label, style = TextStyle(color = muted, fontSize = 11.sp))
        }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

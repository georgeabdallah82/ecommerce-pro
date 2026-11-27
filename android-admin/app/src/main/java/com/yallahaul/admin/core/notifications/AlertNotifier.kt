package com.yallahaul.admin.core.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.yallahaul.admin.MainActivity
import com.yallahaul.admin.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** The phone's notification channels (one per kind of alert) and showing an alert on them. */
@Singleton
class AlertNotifier @Inject constructor(@ApplicationContext private val context: Context) {

    fun createChannels() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel(CHANNEL_ORDERS, context.getString(R.string.channel_orders), NotificationManager.IMPORTANCE_HIGH).apply { description = context.getString(R.string.channel_orders_desc) },
            NotificationChannel(CHANNEL_STOCK, context.getString(R.string.channel_stock), NotificationManager.IMPORTANCE_DEFAULT).apply { description = context.getString(R.string.channel_stock_desc) },
            NotificationChannel(CHANNEL_MESSAGES, context.getString(R.string.channel_messages), NotificationManager.IMPORTANCE_DEFAULT).apply { description = context.getString(R.string.channel_messages_desc) },
            NotificationChannel(CHANNEL_SECURITY, context.getString(R.string.channel_security), NotificationManager.IMPORTANCE_HIGH).apply { description = context.getString(R.string.channel_security_desc) },
            NotificationChannel(CHANNEL_SUMMARY, context.getString(R.string.channel_summary), NotificationManager.IMPORTANCE_LOW).apply { description = context.getString(R.string.channel_summary_desc) },
        )
        manager.createNotificationChannels(channels)
    }

    fun canNotify(): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (android.os.Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    fun show(title: String, body: String, kind: String, path: String, tag: String? = null) {
        if (!canNotify()) return
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_PATH, path)
        }
        val id = (tag ?: "$kind:$path:$title").hashCode()
        val pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, channelFor(kind))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.brand_red))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setCategory(if (kind == "orders") NotificationCompat.CATEGORY_EVENT else NotificationCompat.CATEGORY_MESSAGE)
            // Customer names and amounts stay hidden on the lock screen.
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(
                NotificationCompat.Builder(context, channelFor(kind))
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(context.getString(R.string.app_name))
                    .setContentText(publicText(kind))
                    .build(),
            )
            .setPriority(if (kind == "orders" || kind == "security") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try { NotificationManagerCompat.from(context).notify(tag, id, notification) } catch (_: SecurityException) { }
    }

    fun clearAll() = NotificationManagerCompat.from(context).cancelAll()

    private fun channelFor(kind: String) = when (kind) {
        "orders" -> CHANNEL_ORDERS
        "lowStock" -> CHANNEL_STOCK
        "security" -> CHANNEL_SECURITY
        "summary" -> CHANNEL_SUMMARY
        else -> CHANNEL_MESSAGES
    }

    private fun publicText(kind: String) = when (kind) {
        "orders" -> "Order update"
        "lowStock" -> "Stock alert"
        "security" -> "Security alert"
        "summary" -> "Your daily summary"
        else -> "New message"
    }

    companion object {
        const val EXTRA_PATH = "com.yallahaul.admin.PATH"
        const val CHANNEL_ORDERS = "orders"
        const val CHANNEL_STOCK = "stock"
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_SECURITY = "security"
        const val CHANNEL_SUMMARY = "summary"
    }
}

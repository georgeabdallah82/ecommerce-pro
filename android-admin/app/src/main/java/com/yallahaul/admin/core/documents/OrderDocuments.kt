package com.yallahaul.admin.core.documents

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.core.content.FileProvider
import com.yallahaul.admin.core.model.OrderDetail
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.core.util.Money
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * An order's invoice or packing slip as a PDF, made on the phone from the order the app already
 * loaded: to send on WhatsApp or by email, or print (the phone's print service, including
 * Wi-Fi and many Bluetooth printers). The packing slip has no prices, so it can go in the parcel.
 */
object OrderDocuments {
    enum class Kind(val title: String, val file: String) { Invoice("Invoice", "invoice"), PackingSlip("Packing slip", "packing-slip") }

    private const val W = 595 // A4 in points
    private const val H = 842
    private const val M = 40f

    fun create(context: Context, order: OrderDetail, kind: Kind, storeName: String): File {
        val doc = PdfDocument()
        val title = Paint().apply { isAntiAlias = true; textSize = 22f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); color = Color.rgb(18, 18, 18) }
        val brand = Paint(title).apply { color = Color.rgb(215, 38, 30); textSize = 16f }
        val bold = Paint().apply { isAntiAlias = true; textSize = 10.5f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); color = Color.rgb(18, 18, 18) }
        val text = Paint().apply { isAntiAlias = true; textSize = 10.5f; color = Color.rgb(40, 40, 40) }
        val muted = Paint(text).apply { color = Color.rgb(100, 104, 112); textSize = 9.5f }
        val line = Paint().apply { color = Color.rgb(225, 225, 220); strokeWidth = 1f }
        val money = { v: Long -> Money.format(v, order.currency) }

        var pageNo = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, pageNo).create())
        var c = page.canvas
        var y = M + 10

        fun newPageIfNeeded(space: Float) {
            if (y + space < H - M) return
            doc.finishPage(page); pageNo += 1
            page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, pageNo).create()); c = page.canvas; y = M + 10
        }
        fun wrap(value: String, paint: Paint, width: Float): List<String> {
            val words = value.split(Regex("\\s+")).filter { it.isNotEmpty() }
            val out = mutableListOf<String>(); var cur = ""
            for (w in words) { val next = if (cur.isEmpty()) w else "$cur $w"; if (paint.measureText(next) > width && cur.isNotEmpty()) { out += cur; cur = w } else cur = next }
            if (cur.isNotEmpty()) out += cur
            return out.ifEmpty { listOf("") }
        }

        c.drawText(storeName.uppercase(), M, y, brand)
        c.drawText(kind.title, W - M - title.measureText(kind.title), y + 4, title)
        y += 26
        c.drawText("Order #${order.orderNumber}", M, y, bold)
        val date = Dates.dateTime(order.createdAt)
        c.drawText(date, W - M - text.measureText(date), y, text)
        y += 14
        if (kind == Kind.Invoice) {
            val pay = "${Labels.paymentMethod(order.paymentMethod)} · ${Labels.paymentStatus(order.paymentStatus)}"
            c.drawText(pay, M, y, muted)
            y += 14
        }
        c.drawLine(M, y, W - M, y, line); y += 20

        c.drawText(if (kind == Kind.Invoice) "Bill to" else "Deliver to", M, y, muted); y += 14
        val a = order.shippingAddress
        val addressLines = listOfNotNull(
            order.customer.name,
            listOfNotNull(a["line1"] ?: a["address"], a["line2"]).joinToString(", ").ifBlank { null },
            listOfNotNull(a["area"], a["city"], a["region"], a["country"]).filter { it.isNotBlank() }.joinToString(", ").ifBlank { null },
            order.customer.phone,
            if (kind == Kind.Invoice) order.customer.email else null,
        )
        addressLines.forEach { l -> wrap(l, text, W - 2 * M).forEach { c.drawText(it, M, y, text); y += 14 } }
        y += 10

        // Items
        val qtyX = M; val nameX = M + 40; val unitX = W - M - 150; val totalX = W - M
        c.drawLine(M, y, W - M, y, line); y += 16
        c.drawText("Qty", qtyX, y, bold); c.drawText("Item", nameX, y, bold)
        if (kind == Kind.Invoice) { c.drawText("Price", unitX, y, bold); val t = "Total"; c.drawText(t, totalX - bold.measureText(t), y, bold) }
        y += 8; c.drawLine(M, y, W - M, y, line); y += 16
        val nameWidth = (if (kind == Kind.Invoice) unitX - 12 else W - M) - nameX
        for (item in order.items) {
            val label = listOfNotNull(item.name, item.variant?.takeIf { it.isNotBlank() && it != "Default Title" }).joinToString(" · ")
            val nameLines = wrap(label, text, nameWidth) + listOf("SKU ${item.sku}")
            newPageIfNeeded(nameLines.size * 13f + 10)
            c.drawText("${item.quantity} ×", qtyX, y, bold)
            nameLines.forEachIndexed { i, l -> c.drawText(l, nameX, y + i * 13, if (i == nameLines.size - 1) muted else text) }
            if (kind == Kind.Invoice) {
                c.drawText(money(item.unitPrice), unitX, y, text)
                val t = money(item.totalPrice); c.drawText(t, totalX - text.measureText(t), y, text)
            }
            y += nameLines.size * 13 + 8
        }
        c.drawLine(M, y, W - M, y, line); y += 18

        if (kind == Kind.Invoice) {
            fun total(label: String, value: String, strong: Boolean = false) {
                newPageIfNeeded(18f)
                val p = if (strong) bold else text
                c.drawText(label, unitX - 60, y, p); c.drawText(value, totalX - p.measureText(value), y, p); y += 16
            }
            total("Subtotal", money(order.subtotal))
            if (order.discountTotal > 0) total("Discount" + (order.couponCode?.let { " ($it)" } ?: ""), "−" + money(order.discountTotal))
            total("Delivery", if (order.shippingTotal == 0L) "Free" else money(order.shippingTotal))
            if (order.taxTotal > 0) total("Tax", money(order.taxTotal))
            total("Total", money(order.grandTotal), strong = true)
        } else {
            val count = order.items.sumOf { it.quantity }
            c.drawText("$count item${if (count == 1) "" else "s"} in this parcel", M, y, bold); y += 18
            if (order.isGift && !order.giftMessage.isNullOrBlank()) {
                newPageIfNeeded(60f)
                c.drawText("Gift message", M, y, muted); y += 14
                wrap("“${order.giftMessage}”", text, W - 2 * M).forEach { c.drawText(it, M, y, text); y += 14 }
            }
        }
        if (!order.notes.isNullOrBlank()) {
            y += 10; newPageIfNeeded(40f)
            c.drawText("Customer note", M, y, muted); y += 14
            wrap(order.notes, text, W - 2 * M).forEach { c.drawText(it, M, y, text); y += 14 }
        }
        val thanks = "Thank you for shopping with $storeName"
        c.drawText(thanks, (W - muted.measureText(thanks)) / 2, H - M, muted)
        doc.finishPage(page)

        val dir = File(context.cacheDir, "documents").apply { mkdirs() }
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 3600_000 }?.forEach { it.delete() }
        val file = File(dir, "${kind.file}-${order.orderNumber}.pdf")
        FileOutputStream(file).use { doc.writeTo(it) }
        doc.close()
        return file
    }

    fun share(context: Context, file: File, subject: String) {
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(send, subject).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun print(context: Context, file: File, jobName: String) {
        val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
        manager.print(jobName, object : PrintDocumentAdapter() {
            override fun onLayout(old: PrintAttributes?, new: PrintAttributes, cancel: CancellationSignal?, callback: LayoutResultCallback, extras: Bundle?) {
                if (cancel?.isCanceled == true) { callback.onLayoutCancelled(); return }
                callback.onLayoutFinished(PrintDocumentInfo.Builder(file.name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true)
            }
            override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor, cancel: CancellationSignal?, callback: WriteResultCallback) {
                runCatching {
                    FileInputStream(file).use { input -> FileOutputStream(destination.fileDescriptor).use { input.copyTo(it) } }
                }.onSuccess { callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES)) }.onFailure { callback.onWriteFailed(it.message) }
            }
        }, PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
    }
}

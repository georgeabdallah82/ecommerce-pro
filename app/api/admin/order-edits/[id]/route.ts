import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { reserveStock, releaseReservedQuantity } from '@/lib/inventory'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { remainingRefundable, pickRefundSource, settleReturnRefund, classifyOrderEditPaymentAdjustment, type ReturnableOrder } from '@/lib/returns'
import { OrderStatus, PaymentStatus } from '@prisma/client'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orderEdits.manage')
    const { id } = await params

    const order = await db.$transaction(async tx => {
      const edit = await tx.orderEdit.findUnique({ where: { id }, include: { items: true } })
      if (!edit) throw new Error('Order edit not found')
      if (edit.status !== 'OPEN') throw new Error('Order edit is no longer open')

      const current = await tx.order.findUnique({ where: { id: edit.orderId }, include: { items: true, paymentTransactions: true } })
      if (!current) throw new Error('Order not found')
      if (['CANCELLED', 'REFUNDED'].includes(current.status)) throw new Error('Cancelled or refunded orders cannot be edited')

      const oldMap = new Map(current.items.map(i => [i.id, i]))

      // Checkout reserves stock per line item; changing quantities here without touching that
      // reservation either leaves an order under-reserved (fulfillment later fails outright for
      // the whole order) or over-reserved (stock stays locked up forever once the order ships).
      // Reconcile the reservation pool for every product/variant whose net quantity changes
      // before writing the new item rows, so an edit that would oversell a product fails here
      // instead of silently corrupting inventory.
      const deltaByKey = new Map<string, { productId: string; variantId: string | null; delta: number }>()
      for (const item of edit.items) {
        const existing = item.orderItemId ? oldMap.get(item.orderItemId) : undefined
        const previousQty = existing ? existing.quantity : 0
        const nextQty = existing ? item.quantity : (item.quantity > 0 ? item.quantity : 0)
        const delta = nextQty - previousQty
        if (!delta) continue
        const key = `${item.productId}:${item.variantId || ''}`
        const entry = deltaByKey.get(key) || { productId: item.productId, variantId: item.variantId || null, delta: 0 }
        entry.delta += delta
        deltaByKey.set(key, entry)
      }
      if (deltaByKey.size) {
        const productIds = Array.from(new Set(Array.from(deltaByKey.values()).map(d => d.productId)))
        const products = await tx.product.findMany({ where: { id: { in: productIds } }, include: { inventory: true } })
        const productById = new Map(products.map((p: any) => [p.id, p]))
        for (const { productId, variantId, delta } of deltaByKey.values()) {
          const product = productById.get(productId)
          if (!product) continue
          if (delta > 0) await reserveStock(tx, product, variantId, delta, current.orderNumber)
          else await releaseReservedQuantity(tx, product, variantId, -delta, current.orderNumber)
        }
      }

      for (const item of edit.items) {
        if (item.orderItemId && oldMap.has(item.orderItemId)) {
          await tx.orderItem.update({ where: { id: item.orderItemId }, data: { quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice } })
        } else if (item.quantity > 0) {
          await tx.orderItem.create({ data: { orderId: current.id, productId: item.productId, variantId: item.variantId, name: 'Edited item', sku: 'EDITED', quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice } })
        }
      }

      const subtotal = await tx.orderItem.aggregate({ _sum: { totalPrice: true }, where: { orderId: current.id } })
      const nextSubtotal = Math.max(0, subtotal._sum.totalPrice || 0)
      const delta = nextSubtotal - current.subtotal
      const nextGrand = Math.max(0, current.grandTotal + delta)
      const grandDelta = nextGrand - current.grandTotal

      // An edit that changes the total on an order that's already been paid leaves money out
      // of sync unless it's recorded here -- mirrors how app/api/admin/returns/route.ts handles
      // the same "order total just changed on a paid order" situation. A decrease creates a
      // refund (settled through the gateway the same way a return's refund is); an increase has
      // no automatic re-charge mechanism, so it's recorded as a pending PaymentTransaction the
      // Payment section on the order detail page will surface for staff to collect manually.
      const paymentAdjustment = classifyOrderEditPaymentAdjustment(current.paymentStatus, grandDelta)
      let paymentUpdate: { paymentStatus?: PaymentStatus; status?: OrderStatus } = {}
      let refundToSettle: { refundId: string; refundProvider: string; refundExternalId: string | null; amount: number } | null = null
      if (paymentAdjustment?.type === 'refund') {
        const refundableOrder = current as unknown as ReturnableOrder
        const refundable = remainingRefundable(refundableOrder)
        if (paymentAdjustment.amount > refundable) throw new Error('Order total after this edit would be less than the amount already refunded')
        const { refundProvider, refundExternalId } = pickRefundSource(refundableOrder)
        const refundStatus = refundProvider === 'manual' ? 'refunded' : 'refund_pending'
        const refund = await tx.paymentTransaction.create({ data: { orderId: current.id, provider: refundProvider, externalId: refundExternalId, status: refundStatus, amount: paymentAdjustment.amount, currency: current.currency, rawJson: JSON.stringify({ orderEditId: id, reason: 'Order edit reduced total', actorId: actor.id }) } })
        if (refundStatus === 'refunded') {
          const refundedTotal = refundableOrder.grandTotal - refundable + paymentAdjustment.amount
          paymentUpdate.paymentStatus = refundedTotal >= nextGrand ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
          paymentUpdate.status = paymentUpdate.paymentStatus === 'REFUNDED' ? 'REFUNDED' : current.status
        } else {
          refundToSettle = { refundId: refund.id, refundProvider, refundExternalId, amount: paymentAdjustment.amount }
        }
      } else if (paymentAdjustment?.type === 'charge') {
        await tx.paymentTransaction.create({ data: { orderId: current.id, provider: 'manual', externalId: null, status: 'pending', amount: paymentAdjustment.amount, currency: current.currency, rawJson: JSON.stringify({ orderEditId: id, reason: 'Order edit increased total; additional payment required', actorId: actor.id }) } })
      }

      const updated = await tx.order.update({ where: { id: current.id }, data: { subtotal: nextSubtotal, grandTotal: nextGrand, ...paymentUpdate } })
      await tx.orderEvent.create({ data: { orderId: current.id, status: current.status, message: `Order edited by ${actor.name}.${paymentAdjustment?.type === 'refund' ? ` A refund of ${paymentAdjustment.amount} ${current.currency} is owed.` : paymentAdjustment?.type === 'charge' ? ` An additional ${paymentAdjustment.amount} ${current.currency} is due.` : ''}` } })
      await tx.orderEdit.update({ where: { id }, data: { status: 'COMMITTED', committedAt: new Date(), subtotalAfter: nextSubtotal, deltaTotal: delta } })
      return { updated, refundToSettle, paymentAdjustment }
    })

    void dispatchWebhookEvent('order.updated', { id: order.updated.id, orderNumber: order.updated.orderNumber, status: order.updated.status, paymentStatus: order.updated.paymentStatus }).catch(error => console.error('[webhook] order.updated dispatch failed', error))

    if (order.refundToSettle && order.refundToSettle.refundProvider !== 'manual') {
      const settled = await settleReturnRefund(actor.id, { orderId: order.updated.id, refundId: order.refundToSettle.refundId, refundProvider: order.refundToSettle.refundProvider, refundExternalId: order.refundToSettle.refundExternalId, amount: order.refundToSettle.amount, currency: order.updated.currency, auditAction: 'order.edit_refund' })
      if (!settled.ok) {
        await audit(actor.id, 'order_edit.committed', 'OrderEdit', id, { orderId: order.updated.id, newSubtotal: order.updated.subtotal, newTotal: order.updated.grandTotal })
        return json({ order: order.updated, error: 'Order edit committed, but the gateway refund failed. The refund remains marked failed for admin retry.' }, { status: 502 })
      }
    }

    await audit(actor.id, 'order_edit.committed', 'OrderEdit', id, { orderId: order.updated.id, newSubtotal: order.updated.subtotal, newTotal: order.updated.grandTotal })
    return json({ order: order.updated, paymentAdjustment: order.paymentAdjustment })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to commit order edit'
    const status = message === 'Order edit not found' || message === 'Order not found' ? 404 : message === 'Order edit is no longer open' ? 409 : message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message.includes('cannot be edited') ? 409 : message.includes('already been refunded') ? 409 : 400
    if (status >= 500) console.error('order edit commit failed', e)
    return json({ error: message }, { status })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orderEdits.manage')
    const { id } = await params
    const discarded = await db.$transaction(async tx => {
      const edit = await tx.orderEdit.findUnique({ where: { id } })
      if (!edit) throw new Error('Order edit not found')
      if (edit.status !== 'OPEN') throw new Error('Order edit is no longer open')
      return tx.orderEdit.update({ where: { id }, data: { status: 'DISCARDED' } })
    })
    await audit(actor.id, 'order_edit.discarded', 'OrderEdit', id, { orderId: discarded.orderId })
    return json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to discard order edit'
    const status = message === 'Order edit not found' ? 404 : message === 'Order edit is no longer open' ? 409 : message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return json({ error: message }, { status })
  }
}

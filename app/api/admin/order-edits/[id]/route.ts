import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { reserveStock, releaseReservedQuantity } from '@/lib/inventory'
import { dispatchWebhookEvent } from '@/lib/webhooks'
import { remainingRefundable, pickRefundSource, settleReturnRefund, creditWalletRefund, restoreCoinsForRefund, classifyOrderEditPaymentAdjustment, recomputeOrderEditTotals, type ReturnableOrder } from '@/lib/returns'
import { redeemedGiftCard, restoreGiftCardBalance } from '@/lib/gift-cards'
import { getTaxRatePercent } from '@/lib/pricing'
import { sendOrderEditEmail } from '@/lib/email'
import { OrderStatus, PaymentStatus } from '@prisma/client'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orderEdits.manage')
    const { id } = await params

    const order = await db.$transaction(async tx => {
      const edit = await tx.orderEdit.findUnique({ where: { id }, include: { items: true } })
      if (!edit) throw new Error('Order edit not found')
      if (edit.status !== 'OPEN') throw new Error('Order edit is no longer open')

      // Atomic conditional write, same pattern as completeDraftOrder (lib/draft-orders.ts) and
      // every other money-moving mutation in this codebase: only one concurrent commit of this
      // edit can flip OPEN -> COMMITTED. Without this, a double-click or a client retry both
      // pass the plain status check above and each reconcile inventory reservations and create a
      // refund/charge PaymentTransaction for the same edit. Done as the very first write, before
      // any inventory or payment side effect below, so a losing request aborts here instead of
      // partway through them.
      const guardedEdit = await tx.orderEdit.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'COMMITTED', committedAt: new Date() } })
      if (guardedEdit.count !== 1) throw new Error('Order edit is no longer open')

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

      const allItems = await tx.orderItem.findMany({ where: { orderId: current.id }, select: { productId: true, totalPrice: true } })
      const nextSubtotal = Math.max(0, allItems.reduce((sum, item) => sum + item.totalPrice, 0))
      const delta = nextSubtotal - current.subtotal

      const productIds = Array.from(new Set(allItems.map(item => item.productId)))
      const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, taxable: true } }) : []
      const taxableById = new Map(products.map(p => [p.id, p.taxable]))
      const nextTaxableSubtotal = allItems.reduce((sum, item) => sum + (taxableById.get(item.productId) !== false ? item.totalPrice : 0), 0)
      let shippingCountry: string | undefined
      try { shippingCountry = (JSON.parse(current.shippingAddressJson) as { country?: string })?.country } catch { shippingCountry = undefined }
      const taxRate = await getTaxRatePercent(shippingCountry)
      const { taxTotal: nextTaxTotal, grandTotal: nextGrand } = recomputeOrderEditTotals({ nextSubtotal, nextTaxableSubtotal, discountTotal: current.discountTotal, shippingTotal: current.shippingTotal, taxRatePercent: taxRate })
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
        const refundStatus = refundProvider === 'manual' || refundProvider === 'wallet' ? 'refunded' : 'refund_pending'
        const refund = await tx.paymentTransaction.create({ data: { orderId: current.id, provider: refundProvider, externalId: refundExternalId, status: refundStatus, amount: paymentAdjustment.amount, currency: current.currency, rawJson: JSON.stringify({ orderEditId: id, reason: 'Order edit reduced total', actorId: actor.id }) } })
        if (refundStatus === 'refunded') {
          if (refundProvider === 'wallet') await creditWalletRefund(tx, { userId: current.userId, refundId: refund.id, amount: paymentAdjustment.amount, currency: current.currency })
          const refundedTotal = refundableOrder.grandTotal - refundable + paymentAdjustment.amount
          paymentUpdate.paymentStatus = refundedTotal >= nextGrand ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
          paymentUpdate.status = paymentUpdate.paymentStatus === 'REFUNDED' ? 'REFUNDED' : current.status
          // Proportioned against the order's post-edit total (nextGrand), not its pre-edit
          // total, matching the paymentStatus check just above -- the edit already changed
          // what "fully refunded" means for this order.
          await restoreCoinsForRefund(tx, { order: { ...refundableOrder, grandTotal: nextGrand }, successfulRefunds: refundedTotal, refundId: refund.id })
          const redeemedGift = redeemedGiftCard(refundableOrder.paymentTransactions)
          if (redeemedGift) await restoreGiftCardBalance(tx, current.id, redeemedGift, refundedTotal, nextGrand)
        } else {
          refundToSettle = { refundId: refund.id, refundProvider, refundExternalId, amount: paymentAdjustment.amount }
        }
      } else if (paymentAdjustment?.type === 'charge') {
        await tx.paymentTransaction.create({ data: { orderId: current.id, provider: 'manual', externalId: null, status: 'pending', amount: paymentAdjustment.amount, currency: current.currency, rawJson: JSON.stringify({ orderEditId: id, reason: 'Order edit increased total; additional payment required', actorId: actor.id }) } })
      }

      const updated = await tx.order.update({ where: { id: current.id }, data: { subtotal: nextSubtotal, taxTotal: nextTaxTotal, grandTotal: nextGrand, ...paymentUpdate } })
      await tx.orderEvent.create({ data: { orderId: current.id, status: current.status, message: `Order edited by ${actor.name}.${paymentAdjustment?.type === 'refund' ? ` A refund of ${paymentAdjustment.amount} ${current.currency} is owed.` : paymentAdjustment?.type === 'charge' ? ` An additional ${paymentAdjustment.amount} ${current.currency} is due.` : ''}` } })
      await tx.orderEdit.update({ where: { id }, data: { subtotalAfter: nextSubtotal, deltaTotal: delta } })
      return { updated, refundToSettle, paymentAdjustment, userId: current.userId }
    })

    void dispatchWebhookEvent('order.updated', { id: order.updated.id, orderNumber: order.updated.orderNumber, status: order.updated.status, paymentStatus: order.updated.paymentStatus }).catch(error => console.error('[webhook] order.updated dispatch failed', error))

    // Every other flow that moves money on a paid order (returns, gift cards, fulfillment)
    // notifies the customer -- an order edit that just issued a refund or created a charge the
    // customer now owes was silently skipping that, leaving them to find out only by checking
    // their account later.
    if (order.userId) {
      try {
        const body = order.paymentAdjustment?.type === 'refund'
          ? `A refund of ${(order.paymentAdjustment.amount / 100).toFixed(2)} ${order.updated.currency} was issued for your order ${order.updated.orderNumber}.`
          : order.paymentAdjustment?.type === 'charge'
            ? `Your order ${order.updated.orderNumber} was updated and now requires an additional payment of ${(order.paymentAdjustment.amount / 100).toFixed(2)} ${order.updated.currency}.`
            : `Your order ${order.updated.orderNumber} was updated by our team.`
        await db.notification.create({ data: { userId: order.userId, title: `Order ${order.updated.orderNumber} updated`, body, type: order.paymentAdjustment?.type === 'refund' ? 'ORDER_REFUND' : 'ORDER_STATUS' } })
      } catch {
        // Notification delivery must never make a committed order edit retryable.
      }
    }
    // A gift-card product this edit added should only be issued once it's actually been paid
    // for -- an edit that leaves the order owing more money (a pending manual charge with no
    // automatic confirmation) defers issuance until that payment is later confirmed (see
    // issueAndNotifyGiftCardsForOrder, called from the order PATCH route when staff mark it PAID).
    void sendOrderEditEmail(order.updated.id, order.paymentAdjustment, order.paymentAdjustment?.type !== 'charge').catch(error => console.error('[email] order edit email failed', error))

    if (order.refundToSettle && order.refundToSettle.refundProvider !== 'manual' && order.refundToSettle.refundProvider !== 'wallet') {
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

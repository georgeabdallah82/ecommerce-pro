import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { releaseOrderReservations } from '@/lib/inventory'
import { areebaMpgsPaymentProvider, paymentReturnToken, safeTokenEqual } from '@/lib/payments'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderNumber = url.searchParams.get('order')?.trim() || ''
  const token = url.searchParams.get('token')?.trim() || ''
  const resultIndicator = url.searchParams.get('resultIndicator')?.trim() || ''
  if (!orderNumber || !safeTokenEqual(token, paymentReturnToken(orderNumber))) return Response.redirect(new URL('/checkout?payment=invalid_return', url.origin))

  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, paymentStatus: true, grandTotal: true, currency: true, couponCode: true } })
  if (!order) return Response.redirect(new URL('/checkout?payment=order_not_found', url.origin))

  try {
    const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs' }, orderBy: { createdAt: 'desc' } })
    if (!transaction?.externalId) return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))

    // Areeba documents resultIndicator as the returnUrl integrity value. If a success
    // indicator was stored, the gateway must return the matching indicator.
    const raw = transaction.rawJson ? JSON.parse(transaction.rawJson) as { successIndicator?: unknown } : {}
    const successIndicator = typeof raw.successIndicator === 'string' ? raw.successIndicator : ''
    if (successIndicator && (!resultIndicator || !safeTokenEqual(successIndicator, resultIndicator))) {
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
    }

    const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId, orderNumber)
    if (status === 'paid') {
      if (transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
      await db.$transaction(async tx => {
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } })
        if (current?.paymentStatus !== 'PAID') await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
        await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'paid' } })
      })
      await audit(null, 'payment.paid', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=paid`, url.origin))
    }
    if (status === 'failed') {
      let transitioned = false
      await db.$transaction(async tx => {
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true, status: true, couponCode: true } })
        // Failed payment reconciliation is idempotent. A repeated gateway return/webhook
        // must not release reservations or decrement coupon usage a second time.
        if (!current || ['PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(current.paymentStatus)) return
        await releaseOrderReservations(tx, order.id, 'Online payment failed')
        if (current.couponCode) await tx.coupon.updateMany({ where: { code: current.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'CANCELLED', events: { create: { status: 'CANCELLED', message: 'Online payment failed.' } } } })
        await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'failed' } })
        transitioned = true
      })
      if (transitioned) await audit(null, 'payment.failed', 'Order', order.id, { provider: 'areeba_mpgs', orderNumber: order.orderNumber })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
    }
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  } catch {
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  }
}

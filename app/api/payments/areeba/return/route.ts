import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'
import { areebaMpgsPaymentProvider } from '@/lib/payments'

function webhookToken() { const secret = process.env.AUTH_SECRET; if (!secret) throw new Error('AUTH_SECRET is required'); return createHash('sha256').update(`areeba-webhook:${secret}`).digest('hex') }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderNumber = url.searchParams.get('order')?.trim() || ''
  const resultIndicator = url.searchParams.get('resultIndicator')?.trim() || ''
  if (!orderNumber) return Response.redirect(new URL('/checkout?payment=missing_order', url.origin))

  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, paymentStatus: true, grandTotal: true, currency: true } })
  if (!order) return Response.redirect(new URL('/checkout?payment=order_not_found', url.origin))

  try {
    const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs' }, orderBy: { createdAt: 'desc' } })
    if (!transaction?.externalId) return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))

    // Areeba documents resultIndicator as the returnUrl integrity value. It must match
    // the successIndicator captured when the hosted session was created.
    if (resultIndicator) {
      const raw = transaction.rawJson ? JSON.parse(transaction.rawJson) as { successIndicator?: unknown } : {}
      if (typeof raw.successIndicator === 'string' && raw.successIndicator && raw.successIndicator !== resultIndicator) {
        return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
      }
    }

    const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId, orderNumber)
    if (status === 'paid') {
      if (transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
      await db.$transaction(async tx => {
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } })
        if (current?.paymentStatus !== 'PAID') await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
        await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'paid' } })
      })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=paid`, url.origin))
    }
    if (status === 'failed') {
      if (order.paymentStatus === 'PAID') return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=paid`, url.origin))
      await db.$transaction(async tx => {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } })
        await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'failed' } })
      })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
    }
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  } catch {
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  }
}

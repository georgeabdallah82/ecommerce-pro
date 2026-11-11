import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { areebaMpgsPaymentProvider, paymentReturnToken, safeTokenEqual } from '@/lib/payments'
import { markOnlinePaymentFailed, markOnlinePaymentPaid } from '@/lib/payment-outcome'
import { orderSuccessPath } from '@/lib/order-access'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderNumber = url.searchParams.get('order')?.trim() || ''
  const token = url.searchParams.get('token')?.trim() || ''
  const resultIndicator = url.searchParams.get('resultIndicator')?.trim() || ''

  // Only the gateway's return link carries this server-signed token, so the thank-you links below
  // (which include the order's view code, lib/order-access.ts) only ever go to the paying shopper.
  if (!orderNumber || orderNumber.length > 100 || !safeTokenEqual(token, paymentReturnToken(orderNumber))) {
    return Response.redirect(new URL('/checkout?payment=invalid_return', url.origin))
  }

  const limit = await consumeDurableRateLimit(`areeba-return:${clientIp(req.headers)}:${orderNumber}`, 20, 60 * 1000)
  if (!limit.allowed) return Response.redirect(new URL('/checkout?payment=retry_later', url.origin))

  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, paymentStatus: true, grandTotal: true, currency: true, couponCode: true } })
  if (!order) return Response.redirect(new URL('/checkout?payment=order_not_found', url.origin))

  try {
    const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs' }, orderBy: { createdAt: 'desc' } })
    if (!transaction?.externalId) return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'pending'), url.origin))

    const raw = transaction.rawJson ? JSON.parse(transaction.rawJson) as { successIndicator?: unknown } : {}
    const successIndicator = typeof raw.successIndicator === 'string' ? raw.successIndicator : ''
    if (successIndicator && (!resultIndicator || !safeTokenEqual(successIndicator, resultIndicator))) {
      return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'failed'), url.origin))
    }

    const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId, orderNumber)
    if (status === 'paid') {
      if (transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'failed'), url.origin))
      await markOnlinePaymentPaid(order, transaction.id, 'return')
      return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'paid'), url.origin))
    }

    if (status === 'failed') {
      await markOnlinePaymentFailed(order, transaction.id, 'return')
      return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'failed'), url.origin))
    }

    return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'pending'), url.origin))
  } catch {
    return Response.redirect(new URL(orderSuccessPath(order.orderNumber, 'pending'), url.origin))
  }
}

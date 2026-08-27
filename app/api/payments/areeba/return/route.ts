import { db } from '@/lib/prisma'
import { areebaMpgsPaymentProvider } from '@/lib/payments'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderNumber = url.searchParams.get('order')?.trim() || ''
  if (!orderNumber) return Response.redirect(new URL('/checkout?payment=missing_order', url.origin))

  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, paymentStatus: true, grandTotal: true, currency: true } })
  if (!order) return Response.redirect(new URL('/checkout?payment=order_not_found', url.origin))

  try {
    const status = await areebaMpgsPaymentProvider.getPaymentStatus!(orderNumber, orderNumber)
    if (status === 'paid') {
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
      await db.paymentTransaction.updateMany({ where: { orderId: order.id, provider: 'areeba_mpgs' }, data: { status: 'paid', amount: order.grandTotal, currency: order.currency } })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=paid`, url.origin))
    }
    if (status === 'failed') {
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } })
      await db.paymentTransaction.updateMany({ where: { orderId: order.id, provider: 'areeba_mpgs' }, data: { status: 'failed' } })
      return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=failed`, url.origin))
    }
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  } catch {
    return Response.redirect(new URL(`/order/success?order=${encodeURIComponent(order.orderNumber)}&payment=pending`, url.origin))
  }
}

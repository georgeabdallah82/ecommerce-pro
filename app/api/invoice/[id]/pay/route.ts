import { db } from '@/lib/prisma'
import { completeDraftOrder } from '@/lib/draft-orders'
import { releaseOrderReservations } from '@/lib/inventory'
import { getPaymentProvider, draftInvoiceToken, safeTokenEqual } from '@/lib/payments'
import { consumeRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { PaymentMethod } from '@prisma/client'

// Public, token-secured counterpart to the admin "Complete order" action --
// that one always force-completes a draft as COD with staff collecting
// payment separately; this lets the customer pay it themselves online through
// the store's configured card provider, reusing the exact same
// createPayment/webhook/return machinery checkout already relies on.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = consumeRateLimit(`invoice-pay:${clientIp(req.headers)}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })

    const { id } = await params
    const b = await req.json().catch(() => ({}))
    const token = String(b.token || '')
    if (!token || !safeTokenEqual(token, draftInvoiceToken(id))) return json({ error: 'Invalid or expired invoice link' }, { status: 401 })

    const draft = await db.draftOrder.findUnique({ where: { id } })
    if (!draft) return json({ error: 'Invoice not found' }, { status: 404 })
    if (draft.status === 'COMPLETED') return json({ error: 'This invoice has already been paid' }, { status: 409 })
    if (draft.status === 'CANCELLED') return json({ error: 'This invoice is no longer available' }, { status: 409 })

    const paymentProvider = await getPaymentProvider()
    if (paymentProvider.name === 'manual') return json({ error: 'Online payment is not available for this store right now. Please contact us to pay this invoice.' }, { status: 400 })

    const order = await completeDraftOrder(id, PaymentMethod.CARD)
    try {
      const payment = await paymentProvider.createPayment({ orderId: order.orderNumber, amount: order.grandTotal, currency: order.currency, email: order.email })
      if (payment.externalId) {
        await db.paymentTransaction.create({
          data: {
            orderId: order.id,
            provider: payment.provider,
            externalId: payment.externalId,
            status: payment.status,
            amount: order.grandTotal,
            currency: order.currency,
            rawJson: JSON.stringify({ clientCheckout: payment.clientCheckout ? { type: payment.clientCheckout.type, merchantId: payment.clientCheckout.merchantId, sessionId: payment.clientCheckout.sessionId } : null, successIndicator: payment.clientCheckout?.successIndicator || null }),
          },
        })
      }
      return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal }, payment: payment.clientCheckout || null }, { status: 201 })
    } catch (paymentError) {
      await db.$transaction(async tx => {
        await releaseOrderReservations(tx, order.id, 'Invoice payment initialization failed')
        await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', fulfillmentStatus: 'UNFULFILLED', events: { create: { status: 'CANCELLED', message: 'Invoice payment initialization failed.' } } } })
        await tx.draftOrder.update({ where: { id }, data: { status: 'OPEN', completedOrderId: null } })
      })
      throw paymentError
    }
  } catch (e) {
    console.error('[invoice] payment start failed', e)
    return json({ error: 'Unable to start payment right now. Please try again.' }, { status: 400 })
  }
}

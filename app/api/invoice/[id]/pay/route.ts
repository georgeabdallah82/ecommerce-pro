import { db } from '@/lib/prisma'
import { completeDraftOrder } from '@/lib/draft-orders'
import { releaseOrderReservations } from '@/lib/inventory'
import { getPaymentProvider, draftInvoiceToken, safeTokenEqual } from '@/lib/payments'
import { startInvoicePayment } from '@/lib/invoice-payment'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { json } from '@/lib/utils'
import { PaymentMethod } from '@prisma/client'

// Payment statuses of an order that has been paid for, in whole or in part.
const PAID_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']

// Public, token-secured counterpart to the admin "Complete order" action --
// that one always force-completes a draft as COD with staff collecting
// payment separately; this lets the customer pay it themselves online through
// the store's configured card provider, reusing the exact same
// createPayment/webhook/return machinery checkout already relies on.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = await consumeDurableRateLimit(`invoice-pay:${clientIp(req.headers)}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })

    const { id } = await params
    const b = await req.json().catch(() => ({}))
    const token = String(b.token || '')
    if (!token || !safeTokenEqual(token, draftInvoiceToken(id))) return json({ error: 'Invalid or expired invoice link' }, { status: 401 })

    const draft = await db.draftOrder.findUnique({ where: { id } })
    if (!draft) return json({ error: 'Invoice not found' }, { status: 404 })
    if (draft.status === 'COMPLETED') {
      // An earlier attempt completed the draft. Only a paid order means "already paid". An order whose payment never
      // started, or could not be undone, is not paid: the shopper is sent to the store instead.
      const completed = draft.completedOrderId ? await db.order.findUnique({ where: { id: draft.completedOrderId }, select: { paymentStatus: true } }) : null
      if (completed && PAID_STATUSES.includes(completed.paymentStatus)) return json({ error: 'This invoice has already been paid' }, { status: 409 })
      return json({ error: 'This invoice cannot be paid online right now. Please contact us.' }, { status: 409 })
    }
    if (draft.status === 'CANCELLED') return json({ error: 'This invoice is no longer available' }, { status: 409 })

    const paymentProvider = await getPaymentProvider()
    if (paymentProvider.name === 'manual') return json({ error: 'Online payment is not available for this store right now. Please contact us to pay this invoice.' }, { status: 400 })

    const order = await completeDraftOrder(id, PaymentMethod.CARD)
    const session = await startInvoicePayment({
      // The store's own record comes first, so any payment the gateway takes for this order has a record to match.
      recordPending: () => db.paymentTransaction.create({ data: { orderId: order.id, provider: paymentProvider.name, externalId: null, status: 'pending', amount: order.grandTotal, currency: order.currency } }),
      createSession: () => paymentProvider.createPayment({ orderId: order.orderNumber, amount: order.grandTotal, currency: order.currency, email: order.email }),
      saveSession: async (paymentId, payment) => {
        await db.paymentTransaction.update({
          where: { id: paymentId },
          data: {
            externalId: payment.externalId || null,
            status: payment.status,
            rawJson: JSON.stringify({ clientCheckout: payment.clientCheckout ? { type: payment.clientCheckout.type, merchantId: payment.clientCheckout.merchantId, sessionId: payment.clientCheckout.sessionId } : null, successIndicator: payment.clientCheckout?.successIndicator || null }),
          },
        })
      },
      undo: async ({ paymentId, sessionCreated }) => {
        // One transaction: the stock, the cancellation and the reopened draft come back together, or not at all.
        await db.$transaction(async tx => {
          await releaseOrderReservations(tx, order.id, 'Invoice payment initialization failed')
          await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', fulfillmentStatus: 'UNFULFILLED', events: { create: { status: 'CANCELLED', message: 'Invoice payment initialization failed.' } } } })
          await tx.draftOrder.update({ where: { id }, data: { status: 'OPEN', completedOrderId: null } })
          // Without a gateway session the record is marked failed. Once a session exists the record stays pending, so a
          // payment the gateway takes on it is matched and flagged for staff (the order is cancelled).
          if (paymentId && !sessionCreated) await tx.paymentTransaction.update({ where: { id: paymentId }, data: { status: 'failed' } })
        }, { requireTransaction: true } as any)
      },
    })
    return json({ order: { id: order.id, orderNumber: order.orderNumber, total: order.grandTotal }, payment: session.clientCheckout || null }, { status: 201 })
  } catch (e) {
    console.error('[invoice] payment start failed', e)
    return json({ error: 'Unable to start payment right now. Please try again.' }, { status: 400 })
  }
}

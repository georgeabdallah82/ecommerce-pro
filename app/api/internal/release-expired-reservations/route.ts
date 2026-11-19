import { db } from '@/lib/prisma'
import { releaseOrderReservations } from '@/lib/inventory'
import { isInternalJobRequest } from '@/lib/internal-job'
import { areebaMpgsPaymentProvider } from '@/lib/payments'
import { markOnlinePaymentPaid, restoreUnpaidCheckoutBenefits } from '@/lib/payment-outcome'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client'

const RESERVATION_MINUTES = 30
// A card order sits at status: PENDING until staff manually confirm it (see lib/orders.ts's
// PENDING -> CONFIRMED transition) -- the payment gateway webhook/return handlers only ever
// flip paymentStatus to PAID, they never touch status. Without this exclusion, an order that
// was legitimately paid but is simply still awaiting that manual confirmation looked identical
// to an abandoned, never-paid checkout once RESERVATION_MINUTES had passed, so this cron
// force-cancelled it and released its stock back into inventory with no refund, no webhook,
// and no customer notification.
const RESOLVED_PAYMENT_STATUSES: PaymentStatus[] = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED]

// A card order the gateway did take payment for, whose notification never arrived: marked paid, not cancelled. Any
// other answer, or none (the gateway unreachable or not set up), lets the release go ahead; money that still arrives
// afterwards is flagged on the cancelled order for staff (lib/payment-outcome.ts).
async function paidAtGateway(order: { id: string; orderNumber: string }) {
  const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs', status: { in: ['pending', 'created'] } }, orderBy: { createdAt: 'desc' } })
  if (!transaction) return false
  try {
    if (await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId ?? '', order.orderNumber) !== 'paid') return false
  } catch {
    return false
  }
  await markOnlinePaymentPaid(order, transaction.id, 'expiry')
  return true
}

// Run at the top of each hour by the Worker's cron (worker.ts), or by hand with the CRON_SECRET bearer
// (lib/internal-job.ts). It used to answer only a GET with that bearer, for the old host's scheduler, and nothing
// on Cloudflare called it: card checkouts left at the payment page kept their stock until staff cancelled them.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cutoff = new Date(Date.now() - RESERVATION_MINUTES * 60 * 1000)
  // Only online card checkouts hold stock while the customer is away at the payment page.
  // Cash on delivery and bank transfer orders are unpaid by design until the merchant collects
  // the money, so they must never expire here (they used to: every COD order not confirmed
  // within 30 minutes was cancelled and its stock released).
  const candidates = await db.order.findMany({ where: { status: OrderStatus.PENDING, paymentMethod: PaymentMethod.CARD, paymentStatus: { notIn: RESOLVED_PAYMENT_STATUSES }, createdAt: { lt: cutoff } }, select: { id: true, orderNumber: true }, take: 100, orderBy: { createdAt: 'asc' } })

  let released = 0
  let failed = 0
  let paid = 0
  for (const candidate of candidates) {
    try {
      if (await paidAtGateway(candidate)) { paid += 1; continue }
    } catch (error) {
      failed += 1
      console.error('[expired-reservations] could not record a gateway payment', candidate.orderNumber, error)
      continue
    }
    try {
      const didRelease = await db.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id: candidate.id }, include: { paymentTransactions: true } })
        if (!order || order.status !== OrderStatus.PENDING || order.paymentMethod !== PaymentMethod.CARD || order.createdAt >= cutoff) return false
        if (RESOLVED_PAYMENT_STATUSES.includes(order.paymentStatus)) return false
        const isStorefrontCheckout = order.paymentTransactions.some(t => t.provider === 'checkout')
        if (!isStorefrontCheckout) return false
        const reservation = await tx.inventoryMovement.findFirst({ where: { referenceId: order.orderNumber, type: 'SALE_RESERVATION' } })
        if (!reservation) return false
        await releaseOrderReservations(tx, order.id, 'Expired checkout reservation')
        // Like a failed payment: the customer gets back the coupon use, coins and gift-card
        // balance this unpaid checkout had taken (they used to be lost when it expired).
        await restoreUnpaidCheckoutBenefits(tx, order, 'Expired checkout coin restoration')
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED, fulfillmentStatus: 'UNFULFILLED', events: { create: { status: OrderStatus.CANCELLED, message: 'Checkout reservation expired.' } } } })
        return true
      }, { requireTransaction: true } as any)
      if (didRelease) released += 1
    } catch (error) {
      // Nothing was kept for this order (its release could not run as one transaction), so the next run tries it again.
      failed += 1
      console.error('[expired-reservations] could not release an order', candidate.orderNumber, error)
    }
  }

  return Response.json({ released, failed, paid, checked: candidates.length })
}

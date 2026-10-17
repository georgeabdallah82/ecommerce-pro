import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { canViewOrder } from '@/lib/order-access'
import { cancelOrderForCustomer } from '@/lib/customer-cancel'
import { GUEST_CANCEL_MESSAGES, guestCancelState } from '@/lib/guest-cancel'
import { getGuestCancelConfig } from '@/lib/guest-cancel-server'
import { sendOrderCancelledPush } from '@/lib/push'
import { json } from '@/lib/utils'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const NOT_FOUND = 'Order not found'
const SLOW_DOWN = 'Too many attempts. Please try again later.'

// "Cancel my order" for a customer without an account (thank-you page, Track my order): proved
// with the order's view code or its email (lib/order-access.ts), for a short time after ordering
// and only while the order is still new (lib/guest-cancel.ts). A signed-in owner can use it too.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { orderNumber?: unknown; t?: unknown; email?: unknown }
    const orderNumber = String(body.orderNumber || '').trim().slice(0, 80)
    if (!orderNumber) return json({ error: NOT_FOUND }, { status: 404, headers: NO_STORE })

    const ip = await consumeDurableRateLimit(`order-cancel:ip:${clientIp(req.headers)}`, 20, 15 * 60 * 1000)
    const perOrder = await consumeDurableRateLimit(`order-cancel:order:${orderNumber}`, 10, 60 * 60 * 1000)
    if (!ip.allowed || !perOrder.allowed) return json({ error: SLOW_DOWN }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.max(ip.retryAfterSeconds, perOrder.retryAfterSeconds, 60)) } })

    const user = await getCurrentUser().catch(() => null)
    const config = await getGuestCancelConfig()
    const result = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { orderNumber }, include: { paymentTransactions: { select: { provider: true, rawJson: true } } } })
      // Same answer whether the order exists or the proof is wrong, so this can't be used to probe order numbers.
      if (!order || !canViewOrder(order, { userId: user?.id, token: typeof body.t === 'string' ? body.t : null, email: typeof body.email === 'string' ? body.email : null })) throw new Error(NOT_FOUND)
      const state = guestCancelState(order, config)
      if (!state.allowed) throw new Error(GUEST_CANCEL_MESSAGES[state.reason])
      const minutes = config.minutes
      // Claim the order first: if the owner confirms it at the same moment, only one of us wins.
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      if (claimed.count !== 1) throw new Error(GUEST_CANCEL_MESSAGES.status)
      const updated = await cancelOrderForCustomer(tx, order, `Order cancelled by the customer from the order page (no account needed), within ${minutes} minutes of ordering.`)
      return { updated, minutes }
    })

    await audit(null, 'order.customer_cancelled', 'Order', result.updated.id, { via: user ? 'account' : 'guest', minutes: result.minutes })
    runInBackground(sendOrderCancelledPush({ id: result.updated.id, orderNumber: result.updated.orderNumber, grandTotal: result.updated.grandTotal, currency: result.updated.currency }).catch(error => console.error('[push] order cancelled notification failed', error)))
    return json({ ok: true, order: { orderNumber: result.updated.orderNumber, status: result.updated.status } }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === NOT_FOUND) return json({ error: NOT_FOUND }, { status: 404, headers: NO_STORE })
    if (Object.values(GUEST_CANCEL_MESSAGES).includes(message)) return json({ error: message }, { status: 400, headers: NO_STORE })
    console.error('[orders/cancel] unexpected failure', error)
    return json({ error: 'Unable to cancel the order right now. Please contact us on WhatsApp.' }, { status: 500, headers: NO_STORE })
  }
}

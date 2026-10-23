import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { isInternalJobRequest } from '@/lib/internal-job'
import { alertWaitingOrders } from '@/lib/order-alerts'
import { readOrderWatch, writeOrderWatch } from '@/lib/order-watch-storage'
import { ORDER_PROBLEMS_SETTING, WAIT_MINUTES_SETTING, dueOrders, inQuietHours, nextWatch, waitMinutes } from '@/lib/order-watch'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// The 15-minute check (worker.ts scheduled()). The Worker has already looked at the marker file and
// only calls this when an order is being watched and it is not night, so the database is asked
// only then. Tells the owner once about each order that waited too long without being confirmed.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
  try {
    const watch = await readOrderWatch()
    if (!watch?.armed) return json({ ok: true, idle: true }, { headers: NO_STORE })
    const now = new Date()
    if (inQuietHours(now, watch.tz)) return json({ ok: true, idle: true, quiet: true }, { headers: NO_STORE })

    const settings = await db.setting.findMany({ where: { key: { in: [ORDER_PROBLEMS_SETTING, WAIT_MINUTES_SETTING] } }, select: { key: true, value: true } })
    const value = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const minutes = value[ORDER_PROBLEMS_SETTING] === 'false' ? 0 : waitMinutes(value[WAIT_MINUTES_SETTING])

    // Waiting for the owner to confirm: new orders, except card orders still waiting for the card payment.
    const pending = minutes > 0
      ? await db.order.findMany({
        where: { status: 'PENDING', NOT: { paymentMethod: 'CARD', paymentStatus: { not: 'PAID' } } },
        select: { id: true, orderNumber: true, createdAt: true, grandTotal: true, currency: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
      })
      : []
    const due = dueOrders(pending, now, minutes, watch.alerted)
    let alerted = false
    if (due.length) alerted = await alertWaitingOrders(due, now)
    // If the alert could not go out, the orders stay "not told" and the next check tries again.
    await writeOrderWatch(nextWatch(watch, pending, alerted ? due.map(o => o.id) : [], minutes, now))
    return json({ ok: true, pending: pending.length, alerted: alerted ? due.length : 0 }, { headers: NO_STORE })
  } catch (error) {
    console.error('[order-watch] failure', error)
    return json({ error: 'Order watch failed' }, { status: 500, headers: NO_STORE })
  }
}

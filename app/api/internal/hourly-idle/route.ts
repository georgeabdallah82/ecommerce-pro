import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { isInternalJobRequest } from '@/lib/internal-job'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { readHourlyJobsMarker, setHourlyJobsIdle } from '@/lib/hourly-jobs-storage'

const NO_STORE = { 'Cache-Control': 'no-store' }
// As in app/api/internal/release-expired-reservations: a card checkout with one of these is settled.
const SETTLED: PaymentStatus[] = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED]

// Run by the Worker's cron (worker.ts) right after the hourly jobs, while the database is awake from them: when none
// of them has anything left -- no failed message waiting for another try, no card checkout awaiting payment, no
// refund awaiting the payment gateway -- the marker (lib/hourly-jobs.ts) is cleared and the next hours skip the jobs.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  try {
    const marker = await readHourlyJobsMarker()
    const [retries, cardCheckouts, gatewayRefunds] = await Promise.all([
      db.outboxMessage.count({ where: { status: 'pending' } }),
      db.order.count({ where: { status: OrderStatus.PENDING, paymentMethod: PaymentMethod.CARD, paymentStatus: { notIn: SETTLED } } }),
      db.paymentTransaction.count({ where: { status: 'refund_pending' } }),
    ])
    const waiting = { retries, cardCheckouts, gatewayRefunds }
    if (retries + cardCheckouts + gatewayRefunds > 0) return json({ idle: false, waiting }, { headers: NO_STORE })
    const cleared = await setHourlyJobsIdle(marker.etag)
    return json({ idle: true, cleared, waiting }, { headers: NO_STORE })
  } catch (error) {
    console.error('[hourly-idle] failed', error)
    return json({ error: 'The idle check failed' }, { status: 500, headers: NO_STORE })
  }
}

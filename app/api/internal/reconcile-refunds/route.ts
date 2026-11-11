import { isInternalJobRequest } from '@/lib/internal-job'
import { json } from '@/lib/utils'
import { ordersAwaitingGatewayRefund, reconcileGatewayRefunds } from '@/lib/refund-reconciliation'

const NO_STORE = { 'Cache-Control': 'no-store' }
// A refund younger than this is left to the request that issued it and to the gateway's notification.
const SETTLE_AFTER_MINUTES = 10
const BATCH = 50

// Run by the Worker's 15-minute cron (worker.ts). Asks the gateway about refunds the store has not recorded, so a refund is
// recorded even when no gateway notification arrives, or when the store could not record it when it was issued.
export async function POST(req: Request) {
  if (!isInternalJobRequest(req)) return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const orders = await ordersAwaitingGatewayRefund(new Date(Date.now() - SETTLE_AFTER_MINUTES * 60 * 1000), BATCH)
  let recorded = 0
  let waiting = 0
  let failed = 0
  for (const order of orders) {
    try {
      if (await reconcileGatewayRefunds(order.orderId, order.orderNumber)) recorded += 1
      else waiting += 1
    } catch (error) {
      failed += 1
      console.error('[reconcile-refunds] could not reconcile an order', order.orderNumber, error)
    }
  }
  return json({ checked: orders.length, recorded, waiting, failed }, { headers: NO_STORE })
}

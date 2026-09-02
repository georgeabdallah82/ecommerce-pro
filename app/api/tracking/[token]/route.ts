import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const PUBLIC_STALE_AFTER_MS = 2 * 60 * 1000
const ACTIVE_STATUSES = new Set(['PROCESSING', 'SHIPPED'])

function approximate(value: number | null, decimals = 3) {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken || cleanToken.length < 32 || cleanToken.length > 200) return json({ error: 'Not found' }, { status: 404 })

  const tracking = await db.deliveryTracking.findUnique({ where: { trackingToken: cleanToken } })
  if (!tracking) return json({ error: 'Tracking not found' }, { status: 404 })

  const order = await db.order.findUnique({
    where: { id: tracking.orderId },
    select: { status: true, fulfillmentStatus: true },
  })
  if (!order) return json({ error: 'Tracking not found' }, { status: 404 })

  const active = tracking.active && ACTIVE_STATUSES.has(order.status)
  const updatedAt = tracking.lastLocationUpdatedAt
  const stale = !updatedAt || Date.now() - updatedAt.getTime() > PUBLIC_STALE_AFTER_MS

  return json({
    active,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    etaMinutes: active ? tracking.etaMinutes : null,
    position: active && tracking.latitude !== null && tracking.longitude !== null
      ? { latitude: approximate(tracking.latitude), longitude: approximate(tracking.longitude) }
      : null,
    locationUpdatedAt: updatedAt?.toISOString() || null,
    locationFresh: active && !stale,
    pollingSeconds: 15,
  })
}

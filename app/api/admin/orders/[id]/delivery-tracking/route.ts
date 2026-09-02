import { randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json } from '@/lib/utils'

const MIN_UPDATE_INTERVAL_MS = 5_000
const LAT_MIN = -90
const LAT_MAX = 90
const LON_MIN = -180
const LON_MAX = 180

function numberInRange(value: unknown, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function cleanEta(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) return null
  return minutes
}

function createTrackingToken() {
  return randomBytes(32).toString('base64url')
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('orders.view')
    const { id } = await params
    const tracking = await db.deliveryTracking.findUnique({ where: { orderId: id } })
    if (!tracking) return json({ tracking: null })
    return json({
      tracking: {
        ...tracking,
        publicUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/track/${tracking.trackingToken}` || `/track/${tracking.trackingToken}`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    return json({ error: 'Unable to load delivery tracking' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const order = await db.order.findUnique({ where: { id }, select: { id: true, status: true, fulfillmentStatus: true } })
    if (!order) return json({ error: 'Order not found' }, { status: 404 })

    const tracking = await db.deliveryTracking.findUnique({ where: { orderId: id } })
    const now = new Date()
    if (tracking?.lastLocationUpdatedAt && now.getTime() - tracking.lastLocationUpdatedAt.getTime() < MIN_UPDATE_INTERVAL_MS) {
      return json({ error: 'Location updates are limited to once every 5 seconds.' }, { status: 429 })
    }

    const disable = body.active === false || order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'REFUNDED'
    const latitude = numberInRange(body.latitude, LAT_MIN, LAT_MAX)
    const longitude = numberInRange(body.longitude, LON_MIN, LON_MAX)
    if (!disable && (latitude === null || longitude === null)) {
      return json({ error: 'Valid latitude and longitude are required.' }, { status: 400 })
    }

    const etaMinutes = cleanEta(body.etaMinutes)
    if (!disable && body.etaMinutes !== undefined && body.etaMinutes !== null && body.etaMinutes !== '' && etaMinutes === null) {
      return json({ error: 'ETA must be a whole number from 0 to 1440 minutes.' }, { status: 400 })
    }

    const next = await db.deliveryTracking.upsert({
      where: { orderId: id },
      create: {
        id: randomBytes(16).toString('hex'),
        orderId: id,
        trackingToken: createTrackingToken(),
        latitude: disable ? null : latitude,
        longitude: disable ? null : longitude,
        etaMinutes: disable ? null : etaMinutes,
        lastLocationUpdatedAt: disable ? null : now,
        active: !disable,
      },
      update: {
        latitude: disable ? null : latitude,
        longitude: disable ? null : longitude,
        etaMinutes: disable ? null : etaMinutes,
        lastLocationUpdatedAt: disable ? null : now,
        active: !disable,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: actor?.id || null,
        action: disable ? 'DELIVERY_TRACKING_DISABLED' : 'DELIVERY_TRACKING_UPDATED',
        entity: 'Order',
        entityId: id,
        metadataJson: JSON.stringify({ etaMinutes: disable ? null : etaMinutes, active: !disable, locationUpdated: !disable }),
      },
    })

    return json({
      tracking: {
        ...next,
        publicUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/track/${next.trackingToken}` || `/track/${next.trackingToken}`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[admin/order-delivery-tracking] failure', error)
    return json({ error: 'Unable to update delivery tracking' }, { status: 500 })
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const MAX_LINES = 100
const MAX_TEXT = 120

export async function GET(req: Request) {
  try {
    await requirePermission('orders.view')
    const orderId = new URL(req.url).searchParams.get('orderId')
    const rows = await db.fulfillment.findMany({ where: orderId ? { orderId } : undefined, include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    return json(rows)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to load fulfillments' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('orders.manage')
    const b = await req.json()
    const orderId = String(b.orderId || '').trim()
    if (!orderId) return json({ error: 'orderId is required' }, { status: 400 })

    const input = Array.isArray(b.lines) ? b.lines.slice(0, MAX_LINES) : []
    if (!input.length) return json({ error: 'At least one fulfillment line is required' }, { status: 400 })

    const trackingNumber = b.trackingNumber ? String(b.trackingNumber).trim().slice(0, MAX_TEXT) : null
    const trackingCompany = b.trackingCompany ? String(b.trackingCompany).trim().slice(0, MAX_TEXT) : null
    const trackingUrl = b.trackingUrl ? String(b.trackingUrl).trim().slice(0, 500) : null
    const locationId = b.locationId ? String(b.locationId).trim().slice(0, 120) : null

    const fulfillment = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, fulfillments: { include: { lines: true } } } })
      if (!order) throw new Error('Order not found')
      if (['CANCELLED', 'REFUNDED'].includes(order.status)) throw new Error('Cancelled or refunded orders cannot be fulfilled')

      const orderItems = new Map(order.items.map(item => [item.id, item]))
      const alreadyFulfilled = new Map<string, number>()
      for (const existing of order.fulfillments) {
        if (existing.status === 'CANCELLED') continue
        for (const line of existing.lines) {
          alreadyFulfilled.set(line.orderItemId, (alreadyFulfilled.get(line.orderItemId) || 0) + line.quantity)
        }
      }

      const byItem = new Map<string, { orderItemId: string; productId: string; variantId: string | null; quantity: number }>()
      for (const raw of input) {
        const orderItemId = String(raw?.orderItemId || '').trim()
        const item = orderItems.get(orderItemId)
        if (!item) throw new Error('Every fulfillment line must reference an item from this order')
        const productId = String(raw?.productId || item.productId).trim()
        const variantId = raw?.variantId ? String(raw.variantId).trim() : item.variantId || null
        if (productId !== item.productId || variantId !== (item.variantId || null)) throw new Error('Fulfillment line does not match the order item')
        const quantity = Number(raw?.quantity)
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid fulfillment quantity for ${item.name}`)
        const current = byItem.get(orderItemId)
        const combined = (current?.quantity || 0) + quantity
        const fulfilledBefore = alreadyFulfilled.get(orderItemId) || 0
        if (fulfilledBefore + combined > item.quantity) throw new Error(`Fulfillment quantity for ${item.name} exceeds the unfulfilled quantity`)
        byItem.set(orderItemId, { orderItemId, productId, variantId, quantity: combined })
      }

      const lines = Array.from(byItem.values())
      const created = await tx.fulfillment.create({
        data: {
          orderId,
          status: 'PENDING',
          trackingNumber,
          trackingCompany,
          trackingUrl,
          locationId,
          lines: { create: lines },
        },
        include: { lines: true },
      })
      return created
    })

    await audit(actor.id, 'fulfillment.created', 'Fulfillment', fulfillment.id, { orderId, lineCount: fulfillment.lines.length })
    return json({ fulfillment }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create fulfillment'
    const status = message === 'Order not found' ? 404 : message.includes('unfulfilled') ? 409 : 400
    return json({ error: message }, { status })
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('purchaseOrders.view')
    return json(await db.purchaseOrder.findMany({ include: { items: true, location: true }, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('purchaseOrders.manage')
    const b = await req.json()
    const items = Array.isArray(b.items) ? b.items : []
    if (!items.length) return json({ error: 'At least one purchase order item is required' }, { status: 400 })
    const normalized = items.map((x: any) => {
      const quantityOrdered = Math.max(1, Math.trunc(Number(x.quantityOrdered) || 0))
      const unitCost = Math.max(0, Math.trunc(Number(x.unitCost) || 0))
      return { productId: String(x.productId), variantId: x.variantId ? String(x.variantId) : null, quantityOrdered, quantityReceived: 0, unitCost, totalCost: quantityOrdered * unitCost }
    })
    const totalCost = normalized.reduce((s: number, i: any) => s + i.totalCost, 0)
    const po = await db.purchaseOrder.create({ data: { number: `PO-${Date.now().toString(36).toUpperCase()}`, supplierName: b.supplierName ? String(b.supplierName) : null, locationId: b.locationId ? String(b.locationId) : null, currency: String(b.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD'), totalCost, notes: b.notes ? String(b.notes) : null, items: { create: normalized } }, include: { items: true, location: true } })
    await audit(actor.id, 'purchase_order.created', 'PurchaseOrder', po.id, { number: po.number, totalCost })
    return json({ purchaseOrder: po }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create purchase order' }, { status: 400 }) }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('inventory.view')
    return json(await db.inventoryTransfer.findMany({ include: { items: true, fromLocation: true, toLocation: true }, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('inventory.manage')
    const b = await req.json()
    const items = Array.isArray(b.items) ? b.items : []
    if (!items.length) return json({ error: 'At least one transfer item is required' }, { status: 400 })
    const transfer = await db.inventoryTransfer.create({ data: {
      reference: `TR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      fromLocationId: b.fromLocationId ? String(b.fromLocationId) : null,
      toLocationId: b.toLocationId ? String(b.toLocationId) : null,
      status: b.status === 'PENDING' ? 'PENDING' : 'DRAFT',
      notes: b.notes ? String(b.notes) : null,
      items: { create: items.map((x: any) => ({ inventoryId: x.inventoryId ? String(x.inventoryId) : null, productId: String(x.productId), variantId: x.variantId ? String(x.variantId) : null, quantity: Math.max(1, Math.trunc(Number(x.quantity) || 0)), received: 0 })) },
    }, include: { items: true } })
    await audit(actor.id, 'inventory.transfer.created', 'InventoryTransfer', transfer.id, { reference: transfer.reference, itemCount: items.length })
    return json({ transfer }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create inventory transfer' }, { status: 400 }) }
}

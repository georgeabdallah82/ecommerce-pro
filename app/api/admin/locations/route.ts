import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('inventory.view')
    return json(await db.storeLocation.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('inventory.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Location name is required' }, { status: 400 })
    const handle = slugify(String(b.handle || name)) || `location-${Date.now()}`
    const location = await db.$transaction(async tx => {
      if (b.isDefault) await tx.storeLocation.updateMany({ data: { isDefault: false } })
      return tx.storeLocation.create({ data: { name, handle, addressJson: b.addressJson ? String(b.addressJson) : null, phone: b.phone ? String(b.phone) : null, status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', isDefault: Boolean(b.isDefault) } })
    })
    await audit(actor.id, 'location.created', 'StoreLocation', location.id, { name, handle })
    return json({ location }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create location'
    if (message.includes('Unique constraint')) return json({ error: 'A location with this handle already exists.' }, { status: 409 })
    return json({ error: message }, { status: 400 })
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('settings.view')
    return json(await db.salesChannel.findMany({ include: { _count: { select: { publications: true } } }, orderBy: { createdAt: 'asc' } }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Channel name is required' }, { status: 400 })
    const handle = slugify(String(b.handle || name)) || `channel-${Date.now()}`
    const channel = await db.salesChannel.create({ data: { name, handle, status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', configJson: b.configJson ? String(b.configJson) : null } })
    await audit(actor.id, 'sales_channel.created', 'SalesChannel', channel.id, { name, handle })
    return json({ salesChannel: channel }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create sales channel' }, { status: 400 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const b = await req.json()
    const id = String(b.id || '')
    const channel = await db.salesChannel.update({ where: { id }, data: { ...(b.name !== undefined ? { name: String(b.name).trim() } : {}), ...(b.status ? { status: b.status } : {}), ...(b.configJson !== undefined ? { configJson: b.configJson ? String(b.configJson) : null } : {}) }, include: { _count: { select: { publications: true } } } })
    await audit(actor.id, 'sales_channel.updated', 'SalesChannel', id, { fields: Object.keys(b) })
    return json({ salesChannel: channel })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update sales channel' }, { status: 400 }) }
}

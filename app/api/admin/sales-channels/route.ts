import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json, slugify } from '@/lib/utils'
import { cappedJson, LIST_CAP } from '@/lib/admin-list'

export async function GET() {
  try {
    await requirePermission('salesChannels.view')
    return cappedJson(await db.salesChannel.findMany({ include: { _count: { select: { publications: true } } }, orderBy: { createdAt: 'asc' }, take: LIST_CAP + 1 }), LIST_CAP)
  } catch (e) { return routeError(e, 'Forbidden', 403) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('salesChannels.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Channel name is required' }, { status: 400 })
    const handle = slugify(String(b.handle || name)) || `channel-${Date.now()}`
    const channel = await db.salesChannel.create({ data: { name, handle, status: b.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', configJson: b.configJson ? String(b.configJson) : null } })
    await audit(actor.id, 'sales_channel.created', 'SalesChannel', channel.id, { name, handle })
    return json({ salesChannel: channel }, { status: 201 })
  } catch (e) { return routeError(e, 'Unable to create sales channel', 400) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('salesChannels.manage')
    const b = await req.json()
    const id = String(b.id || '')
    const channel = await db.salesChannel.update({ where: { id }, data: { ...(b.name !== undefined ? { name: String(b.name).trim() } : {}), ...(b.status ? { status: b.status } : {}), ...(b.configJson !== undefined ? { configJson: b.configJson ? String(b.configJson) : null } : {}) }, include: { _count: { select: { publications: true } } } })
    await audit(actor.id, 'sales_channel.updated', 'SalesChannel', id, { fields: Object.keys(b) })
    return json({ salesChannel: channel })
  } catch (e) { return routeError(e, 'Unable to update sales channel', 400) }
}

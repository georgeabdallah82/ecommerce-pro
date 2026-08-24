import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const value = String(body.value || '').trim().slice(0, 100)
    if (!value) return json({ error: 'Tag is required' }, { status: 400 })
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })
    const tag = await db.customerTag.upsert({ where: { value }, update: {}, create: { value } })
    await db.customerTagMember.upsert({ where: { tagId_customerId: { tagId: tag.id, customerId: id } }, update: {}, create: { tagId: tag.id, customerId: id } })
    await audit(actor.id, 'customer_tag.added', 'User', id, { tag: value })
    return json({ tag })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to add tag' }, { status: 400 }) }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const tagId = String(body.tagId || '')
    if (!tagId) return json({ error: 'Tag id is required' }, { status: 400 })
    await db.customerTagMember.delete({ where: { tagId_customerId: { tagId, customerId: id } } })
    await audit(actor.id, 'customer_tag.removed', 'User', id, { tagId })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to remove tag' }, { status: 400 }) }
}

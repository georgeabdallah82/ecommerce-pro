import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const segmentId = String(body.segmentId || '')
    if (!segmentId) return json({ error: 'Segment is required' }, { status: 400 })
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })
    const segment = await db.customerSegment.findUnique({ where: { id: segmentId }, select: { id: true, name: true } })
    if (!segment) return json({ error: 'Segment not found' }, { status: 404 })
    await db.customerSegmentMember.upsert({ where: { segmentId_customerId: { segmentId, customerId: id } }, update: {}, create: { segmentId, customerId: id } })
    await audit(actor.id, 'customer_segment.added', 'User', id, { segmentId, segment: segment.name })
    return json({ segment })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to add segment' }, { status: 400 }) }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const segmentId = String(body.segmentId || '')
    if (!segmentId) return json({ error: 'Segment id is required' }, { status: 400 })
    await db.customerSegmentMember.delete({ where: { segmentId_customerId: { segmentId, customerId: id } } })
    await audit(actor.id, 'customer_segment.removed', 'User', id, { segmentId })
    return json({ ok: true })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to remove segment' }, { status: 400 }) }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

const JSON_HEADERS = { 'Cache-Control': 'private, no-store' }

async function getCustomer(id: string) {
  return db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const segmentId = String(body?.segmentId ?? '').trim()
    if (!segmentId) return json({ error: 'Segment is required' }, { status: 400, headers: JSON_HEADERS })

    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    const segment = await db.customerSegment.findUnique({
      where: { id: segmentId },
      select: { id: true, name: true },
    })
    if (!segment) return json({ error: 'Segment not found' }, { status: 404, headers: JSON_HEADERS })

    await db.customerSegmentMember.upsert({
      where: { segmentId_customerId: { segmentId, customerId: id } },
      update: {},
      create: { segmentId, customerId: id },
    })

    await audit(actor.id, 'customer_segment.added', 'User', id, { segmentId, segment: segment.name })
    return json({ segment }, { headers: JSON_HEADERS })
  } catch (error) {
    console.error('[admin/customer-segments] POST failed', error)
    return json({ error: 'Unable to add customer segment' }, { status: 500, headers: JSON_HEADERS })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const segmentId = String(body?.segmentId ?? '').trim()
    if (!segmentId) return json({ error: 'Segment id is required' }, { status: 400, headers: JSON_HEADERS })

    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    const membership = await db.customerSegmentMember.findUnique({
      where: { segmentId_customerId: { segmentId, customerId: id } },
      select: { segmentId: true },
    })
    if (!membership) return json({ error: 'Segment is not assigned to this customer' }, { status: 404, headers: JSON_HEADERS })

    await db.customerSegmentMember.delete({ where: { segmentId_customerId: { segmentId, customerId: id } } })
    await audit(actor.id, 'customer_segment.removed', 'User', id, { segmentId })
    return json({ ok: true }, { headers: JSON_HEADERS })
  } catch (error) {
    console.error('[admin/customer-segments] DELETE failed', error)
    return json({ error: 'Unable to remove customer segment' }, { status: 500, headers: JSON_HEADERS })
  }
}

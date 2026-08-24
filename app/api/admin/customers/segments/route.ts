import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('customers.view')
    return json(await db.customerSegment.findMany({ include: { _count: { select: { members: true } } }, orderBy: { updatedAt: 'desc' } }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Segment name is required' }, { status: 400 })
    const segment = await db.customerSegment.create({ data: { name, description: b.description ? String(b.description) : null, ruleJson: typeof b.ruleJson === 'string' ? b.ruleJson : JSON.stringify(b.rules || {}) } })
    if (Array.isArray(b.customerIds) && b.customerIds.length) await db.customerSegmentMember.createMany({ data: [...new Set(b.customerIds.map((x: unknown) => String(x)).filter(Boolean))].map((customerId: string) => ({ segmentId: segment.id, customerId })), skipDuplicates: true })
    await audit(actor.id, 'customer_segment.created', 'CustomerSegment', segment.id, { name, customerCount: Array.isArray(b.customerIds) ? b.customerIds.length : 0 })
    return json({ segment }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create customer segment' }, { status: 400 }) }
}

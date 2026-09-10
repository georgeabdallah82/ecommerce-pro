import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    await requirePermission('customerSegments.view')
    const segments = await db.customerSegment.findMany({ orderBy: { updatedAt: 'desc' } })
    const counts = (segments.length
      ? await db.customerSegmentMember.groupBy({ by: ['segmentId'], _count: { _all: true }, where: { segmentId: { in: segments.map(s => s.id) } } })
      : []) as { segmentId: string; _count: { _all: number } }[]
    const countBySegment = Object.fromEntries(counts.map(c => [c.segmentId, c._count._all]))
    const rows = segments.map(segment => ({ ...segment, _count: { members: countBySegment[segment.id] || 0 } }))
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customerSegments.manage')
    const b = await req.json()
    const name = String(b.name || '').trim()
    if (!name) return json({ error: 'Segment name is required' }, { status: 400 })
    const segment = await db.customerSegment.create({ data: { name, description: b.description ? String(b.description) : null, ruleJson: typeof b.ruleJson === 'string' ? b.ruleJson : JSON.stringify(b.rules || {}) } })
    const customerIds: string[] = Array.isArray(b.customerIds)
      ? Array.from(new Set<string>(b.customerIds.map((x: unknown) => String(x)).filter((x: string) => x.length > 0)))
      : []
    for (const customerId of customerIds) {
      await db.customerSegmentMember.upsert({ where: { segmentId_customerId: { segmentId: segment.id, customerId } }, update: {}, create: { segmentId: segment.id, customerId } })
    }
    await audit(actor.id, 'customer_segment.created', 'CustomerSegment', segment.id, { name, customerCount: customerIds.length })
    return json({ segment }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create customer segment' }, { status: 400 }) }
}

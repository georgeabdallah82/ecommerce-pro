import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import CustomerSegmentsAdmin from '@/components/customer-segments-admin'

export default async function CustomerSegmentsPage() {
  const user = await requirePermission('customerSegments.view')
  const segments = await db.customerSegment.findMany({ orderBy: { updatedAt: 'desc' } })
  const counts = (segments.length
    ? await db.customerSegmentMember.groupBy({ by: ['segmentId'], _count: { _all: true }, where: { segmentId: { in: segments.map(s => s.id) } } })
    : []) as { segmentId: string; _count: { _all: number } }[]
  const countBySegment = Object.fromEntries(counts.map(c => [c.segmentId, c._count._all]))
  const rows = segments.map(segment => ({ ...segment, _count: { members: countBySegment[segment.id] || 0 } }))
  return <CustomerSegmentsAdmin initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'customerSegments.manage')} />
}

import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import CustomerSegmentsAdmin from '@/components/customer-segments-admin'

export default async function CustomerSegmentsPage() {
  const user = await requirePermission('customerSegments.view')
  const segments = await db.customerSegment.findMany({ orderBy: { updatedAt: 'desc' } })
  const rows = await Promise.all(segments.map(async segment => ({
    ...segment,
    _count: { members: await db.customerSegmentMember.count({ where: { segmentId: segment.id } }) },
  })))
  return <CustomerSegmentsAdmin initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'customerSegments.manage')} />
}

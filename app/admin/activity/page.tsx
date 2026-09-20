import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import ActivityLogAdmin from '@/components/activity-log-admin'

const PAGE_SIZE = 50

export default async function Activity() {
  await requirePermission('activity.view')
  const [rows, total, entityRows, storeTimezone] = await Promise.all([
    db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE }),
    db.auditLog.count(),
    db.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    getStoreTimezone(),
  ])

  const initial = rows.map(r => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actor: r.actor ? { name: r.actor.name, email: r.actor.email } : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    metadataJson: r.metadataJson,
  }))

  return <ActivityLogAdmin initial={initial} total={total} entities={entityRows.map(e => e.entity)} pageSize={PAGE_SIZE} storeTimezone={storeTimezone} />
}

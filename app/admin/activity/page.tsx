import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import ActivityLogAdmin from '@/components/activity-log-admin'

const PAGE_SIZE = 50

export default async function Activity() {
  await requirePermission('activity.view')
  const [rows, total, entityRows, actionRows, actorRows, storeTimezone] = await Promise.all([
    db.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE }),
    db.auditLog.count(),
    db.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    db.auditLog.findMany({ where: { actorId: { not: null } }, distinct: ['actorId'], select: { actor: { select: { id: true, name: true, email: true } } } }),
    getStoreTimezone(),
  ])

  const initial = rows.map(r => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actor: r.actor ? { id: r.actor.id, name: r.actor.name, email: r.actor.email } : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    metadataJson: r.metadataJson,
  }))

  const actors = actorRows
    .map(r => r.actor)
    .filter((a): a is { id: string; name: string; email: string } => Boolean(a))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))

  return (
    <ActivityLogAdmin
      initial={initial}
      total={total}
      entities={entityRows.map(e => e.entity)}
      actions={actionRows.map(a => a.action)}
      actors={actors}
      pageSize={PAGE_SIZE}
      storeTimezone={storeTimezone}
    />
  )
}

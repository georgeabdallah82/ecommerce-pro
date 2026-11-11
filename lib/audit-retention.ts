import { db } from '@/lib/prisma'
import { audit } from '@/lib/audit'

// The activity log keeps a year of entries. The daily job (app/api/internal/daily) removes older ones,
// a little at a time, and records how many it removed.
export const AUDIT_RETENTION_DAYS = 365
const BATCH = 2000
const MAX_BATCHES = 50

export async function pruneAuditLog(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  let removed = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const old = await db.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: BATCH })
    if (!old.length) break
    const { count } = await db.auditLog.deleteMany({ where: { id: { in: old.map(row => row.id) } } })
    removed += count
    if (old.length < BATCH) break
  }
  if (removed) await audit(null, 'activity.pruned', 'AuditLog', undefined, { removed, olderThanDays: AUDIT_RETENTION_DAYS })
  return removed
}

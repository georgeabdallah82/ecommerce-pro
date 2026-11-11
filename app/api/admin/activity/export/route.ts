import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { getStoreTimezone } from '@/lib/store-timezone'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { activityWhere } from '@/lib/activity-query'
import { activityCsv } from '@/lib/activity-export'
import { routeError } from '@/lib/api-error'

const MAX_ROWS = 10_000

// The activity log as a CSV file, with the same filters as the list. A file holds at most 10,000 entries;
// the X-Truncated header says when there were more.
export async function GET(req: Request) {
  try {
    const actor = await requirePermission('activity.view')
    const { searchParams } = new URL(req.url)
    const timezone = await getStoreTimezone()
    const rows = await db.auditLog.findMany({ where: activityWhere(searchParams, timezone), include: { actor: true }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS + 1 })
    const truncated = rows.length > MAX_ROWS
    const kept = rows.slice(0, MAX_ROWS)
    const body = activityCsv(kept.map(row => ({
      time: formatAdminDateTime(row.createdAt, timezone),
      who: row.actor?.name || 'System',
      email: row.actor?.email || '',
      action: row.action,
      entity: row.entity,
      entityId: row.entityId || '',
      details: row.metadataJson || '',
    })))
    await audit(actor.id, 'activity.exported', 'AuditLog', undefined, { rows: kept.length, truncated })
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="activity-${stamp}.csv"`,
        'Cache-Control': 'private, no-store',
        ...(truncated ? { 'X-Truncated': 'true' } : {}),
      },
    })
  } catch (e) {
    return routeError(e, 'Unable to export the activity log', 400)
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json, clampInt } from '@/lib/utils'
import { getStoreTimezone } from '@/lib/store-timezone'
import { addCalendarDays, zonedMidnight } from '@/lib/admin-datetime'

const PAGE_SIZE = 50
const DAY = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  try {
    await requirePermission('activity.view')
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim().slice(0, 120)
    const entity = (searchParams.get('entity') || '').trim().slice(0, 80)
    const action = (searchParams.get('action') || '').trim().slice(0, 120)
    // "system" = automatic actions with no staff member; any other value is a staff user's id.
    const actor = (searchParams.get('actor') || '').trim().slice(0, 60)
    const from = (searchParams.get('from') || '').trim()
    const to = (searchParams.get('to') || '').trim()
    const skip = clampInt(searchParams.get('skip'), 0, 100000, 0)
    const take = clampInt(searchParams.get('take'), 1, PAGE_SIZE, PAGE_SIZE)

    const timezone = await getStoreTimezone()
    // Dates are calendar days in the store's timezone, so "Today" means the store's today.
    const range: { gte?: Date; lt?: Date } = {}
    if (DAY.test(from)) range.gte = zonedMidnight(from, timezone)
    if (DAY.test(to)) range.lt = zonedMidnight(addCalendarDays(to, 1), timezone)

    const where: any = {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(actor === 'system' ? { actorId: null } : actor ? { actorId: actor } : {}),
      ...(range.gte || range.lt ? { createdAt: range } : {}),
      ...(q ? { OR: [
        { action: { contains: q, mode: 'insensitive' } },
        { entity: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q, mode: 'insensitive' } },
        { actor: { is: { email: { contains: q, mode: 'insensitive' } } } },
        { actor: { is: { name: { contains: q, mode: 'insensitive' } } } },
      ] } : {}),
    }

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: 'desc' }, skip, take }),
      db.auditLog.count({ where }),
    ])

    return json({
      rows: rows.map(r => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor ? { id: r.actor.id, name: r.actor.name, email: r.actor.email } : null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        metadataJson: r.metadataJson,
      })),
      total,
      skip,
      take,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load activity log'
    return json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}

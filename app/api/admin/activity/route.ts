import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { json, clampInt } from '@/lib/utils'

const PAGE_SIZE = 50

export async function GET(req: Request) {
  try {
    await requirePermission('activity.view')
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const entity = (searchParams.get('entity') || '').trim()
    const skip = clampInt(searchParams.get('skip'), 0, 100000, 0)
    const take = clampInt(searchParams.get('take'), 1, PAGE_SIZE, PAGE_SIZE)

    const where: any = {
      ...(entity ? { entity } : {}),
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
        actor: r.actor ? { name: r.actor.name, email: r.actor.email } : null,
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

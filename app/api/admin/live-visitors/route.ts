import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const ACTIVE_WINDOW_MS = 90_000

export async function GET() {
  try {
    await requirePermission('reports.view')
    const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS)
    const rows = await db.liveVisitorSession.findMany({
      where: { lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
    })

    const userIds = [...new Set(rows.map(v => v.userId).filter((id): id is string => Boolean(id)))]
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    const names = new Map(users.map(u => [u.id, u.name]))

    return json({
      generatedAt: new Date().toISOString(),
      activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
      visitors: rows.map(v => ({ ...v, name: v.userId ? names.get(v.userId) || null : null, firstSeenAt: v.firstSeenAt.toISOString(), lastSeenAt: v.lastSeenAt.toISOString() })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[admin/live-visitors] failure', error)
    return json({ error: 'Unable to load live visitors' }, { status: 500 })
  }
}

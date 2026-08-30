import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const ACTIVE_WINDOW_MS = 90_000

export async function GET() {
  try {
    await requirePermission('reports.view')
    const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS)
    const rows = await db.$queryRaw<Array<{
      sessionId: string; userId: string | null; name: string | null; path: string; country: string | null; city: string | null; region: string | null
      latitude: number | null; longitude: number | null; device: string | null; browser: string | null; os: string | null; referrer: string | null
      firstSeenAt: Date; lastSeenAt: Date
    }>>`
      SELECT v."sessionId", v."userId", u."name", v."path", v."country", v."city", v."region",
             v."latitude", v."longitude", v."device", v."browser", v."os", v."referrer",
             v."firstSeenAt", v."lastSeenAt"
      FROM "LiveVisitorSession" v
      LEFT JOIN "User" u ON u."id" = v."userId"
      WHERE v."lastSeenAt" >= ${cutoff}
      ORDER BY v."lastSeenAt" DESC
      LIMIT 500
    `

    return json({
      generatedAt: new Date().toISOString(),
      activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
      visitors: rows.map(v => ({ ...v, firstSeenAt: v.firstSeenAt.toISOString(), lastSeenAt: v.lastSeenAt.toISOString() })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[admin/live-visitors] failure', error)
    return json({ error: 'Unable to load live visitors' }, { status: 500 })
  }
}

import { db } from '@/lib/prisma'
import { requireStaff } from '@/lib/auth'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { parseStaffAlertType, STAFF_ALERT_TYPE_PREFIX } from '@/lib/mobile-devices'

const noStore = { 'Cache-Control': 'private, no-store' }

// The signed-in person's alert history in the Android admin app (kept 30 days, lib/mobile-devices.ts).
// `since` returns only newer alerts: the app checks it every 15 minutes when Firebase is not set up.
export async function GET(req: Request) {
  try {
    const user = await requireStaff()
    const params = new URL(req.url).searchParams
    const sinceRaw = params.get('since')
    const since = sinceRaw ? new Date(sinceRaw) : null
    const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 50))
    const where = { userId: user.id, type: { startsWith: STAFF_ALERT_TYPE_PREFIX }, ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}) }
    const [rows, unread] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      db.notification.count({ where: { userId: user.id, type: { startsWith: STAFF_ALERT_TYPE_PREFIX }, readAt: null } }),
    ])
    const items = rows.flatMap(row => {
      const parsed = parseStaffAlertType(row.type)
      return parsed ? [{ id: row.id, title: row.title, body: row.body, kind: parsed.kind, path: parsed.path, read: !!row.readAt, createdAt: row.createdAt }] : []
    })
    return json({ items, unread }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to load alerts', 400, noStore) }
}

// Marks alerts read: some by id, or all of them.
export async function POST(req: Request) {
  try {
    const user = await requireStaff()
    const body = await req.json().catch(() => ({})) as { ids?: unknown; all?: unknown; clear?: unknown }
    const base = { userId: user.id, type: { startsWith: STAFF_ALERT_TYPE_PREFIX } }
    if (body.clear === true) {
      await db.notification.deleteMany({ where: base })
      return json({ ok: true }, { headers: noStore })
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 200) : []
    if (body.all !== true && !ids.length) return json({ error: 'Nothing to mark' }, { status: 400, headers: noStore })
    await db.notification.updateMany({ where: { ...base, readAt: null, ...(body.all === true ? {} : { id: { in: ids } }) }, data: { readAt: new Date() } })
    return json({ ok: true }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to update alerts', 400, noStore) }
}

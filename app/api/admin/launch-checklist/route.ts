import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { LAUNCH_MANUAL_KEY, MANUAL_IDS } from '@/lib/launch-checklist'
import { parseManual } from '@/lib/launch-facts'

const noStore = { 'Cache-Control': 'private, no-store' }

// Ticks (or unticks) an item the store cannot check by itself (Admin > Launch checklist).
export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json().catch(() => ({})) as { id?: unknown; done?: unknown }
    const id = String(body.id || '')
    if (!MANUAL_IDS.includes(id)) return json({ error: 'That item is ticked by the store itself.' }, { status: 400, headers: noStore })
    const row = await db.setting.findUnique({ where: { key: LAUNCH_MANUAL_KEY } })
    const manual = parseManual(row?.value)
    if (body.done === true) manual[id] = new Date().toISOString()
    else delete manual[id]
    const value = JSON.stringify(manual)
    await db.setting.upsert({ where: { key: LAUNCH_MANUAL_KEY }, update: { value }, create: { key: LAUNCH_MANUAL_KEY, value } })
    await audit(actor.id, 'launch.checklist', 'Setting', undefined, { id, done: body.done === true })
    return json({ ok: true, manual }, { headers: noStore })
  } catch (error) { return routeError(error, 'Unable to save', 400) }
}

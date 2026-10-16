import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { MAX_OCCASIONS, OCCASIONS_KEY, cleanLink, occasionError, readOccasions } from '@/lib/occasions'

// Marketing > Occasions (lib/occasions.ts): save the whole list at once.
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const body = await req.json().catch(() => ({})) as { occasions?: unknown }
    if (!Array.isArray(body.occasions)) return json({ error: 'Nothing to save' }, { status: 400 })
    if (body.occasions.length > MAX_OCCASIONS) return json({ error: `Up to ${MAX_OCCASIONS} occasions` }, { status: 400 })
    const typed = (body.occasions as Array<Record<string, unknown>>).map((o, i) => ({
      id: String(o?.id || `o${Date.now().toString(36)}${i}`).slice(0, 40), name: String(o?.name ?? ''), nameAr: String(o?.nameAr ?? ''),
      date: String(o?.date ?? ''), orderBy: String(o?.orderBy ?? ''), showFrom: String(o?.showFrom ?? ''), link: String(o?.link ?? ''),
    }))
    for (const o of typed) {
      const problem = occasionError(o)
      if (problem) return json({ error: problem }, { status: 400 })
      if (o.link.trim() && !cleanLink(o.link)) return json({ error: `${o.name}: the link must be a page of this store, like /shop` }, { status: 400 })
    }
    const occasions = readOccasions(JSON.stringify(typed))
    await db.setting.upsert({ where: { key: OCCASIONS_KEY }, create: { key: OCCASIONS_KEY, value: JSON.stringify(occasions) }, update: { value: JSON.stringify(occasions) } })
    await audit(actor.id, 'occasions.updated', 'Setting', OCCASIONS_KEY, { count: occasions.length })
    return json({ occasions })
  } catch (error) { return routeError(error, 'Unable to save the occasions', 400) }
}

import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { createInfluencer, deleteInfluencer, updateInfluencer } from '@/lib/influencers'
import { validateInfluencer } from '@/lib/influencers-shared'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const conflict = (error: unknown) => routeError(error, 'Unable to save', 409, NO_STORE)

// Admin > Marketing > Influencers: add one (this also makes their discount code), change one,
// pause or resume one, or remove one that was never used.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const checked = validateInfluencer(await req.json().catch(() => ({})))
    if (!checked.ok) return json({ error: checked.error }, { status: 400, headers: NO_STORE })
    let influencer
    try { influencer = await createInfluencer(checked.value) } catch (error) { return conflict(error) }
    await audit(actor.id, 'influencer.created', 'Influencer', influencer.id, { code: influencer.code, customerPercent: influencer.customerPercent, commissionPercent: influencer.commissionPercent })
    return json({ ok: true, id: influencer.id }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to add the influencer', 400)
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const id = String(body.id || '').trim()
    if (!id) return json({ error: 'Choose an influencer' }, { status: 400, headers: NO_STORE })
    const checked = validateInfluencer(body, { requireCode: false })
    if (!checked.ok) return json({ error: checked.error }, { status: 400, headers: NO_STORE })
    const { code: _code, ...details } = checked.value
    const isActive = body.isActive !== false
    let influencer
    try { influencer = await updateInfluencer(id, details, isActive) } catch (error) { return conflict(error) }
    await audit(actor.id, isActive ? 'influencer.updated' : 'influencer.paused', 'Influencer', influencer.id, { code: influencer.code, customerPercent: influencer.customerPercent, commissionPercent: influencer.commissionPercent, isActive })
    return json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to save the influencer', 400)
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const id = String(new URL(req.url).searchParams.get('id') || '').trim()
    if (!id) return json({ error: 'Choose an influencer' }, { status: 400, headers: NO_STORE })
    let removed
    try { removed = await deleteInfluencer(id) } catch (error) { return conflict(error) }
    await audit(actor.id, 'influencer.deleted', 'Influencer', removed.id, { code: removed.code })
    return json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to remove the influencer', 400)
  }
}

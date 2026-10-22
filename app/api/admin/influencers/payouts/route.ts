import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { validatePayout } from '@/lib/influencers-shared'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Admin > Marketing > Influencers: write down a payment made to an influencer, or undo one that
// was written by mistake. The amount owed is always what they earned minus these payments.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const influencerId = String(body.influencerId || '').trim()
    const checked = validatePayout(body)
    if (!influencerId) return json({ error: 'Choose an influencer' }, { status: 400, headers: NO_STORE })
    if (!checked.ok) return json({ error: checked.error }, { status: 400, headers: NO_STORE })
    const influencer = await db.influencer.findUnique({ where: { id: influencerId }, select: { id: true, code: true } })
    if (!influencer) return json({ error: 'Influencer not found' }, { status: 404, headers: NO_STORE })
    const payout = await db.influencerPayout.create({ data: { influencerId, amount: checked.amount, note: checked.note || null, createdById: actor.id } })
    await audit(actor.id, 'influencer.payout_recorded', 'Influencer', influencerId, { payoutId: payout.id, code: influencer.code, amount: payout.amount })
    return json({ ok: true, id: payout.id }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to save the payment', 400)
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const id = String(new URL(req.url).searchParams.get('id') || '').trim()
    if (!id) return json({ error: 'Choose a payment' }, { status: 400, headers: NO_STORE })
    const payout = await db.influencerPayout.findUnique({ where: { id }, select: { id: true, influencerId: true, amount: true } })
    if (!payout) return json({ error: 'Payment not found' }, { status: 404, headers: NO_STORE })
    await db.influencerPayout.delete({ where: { id } })
    await audit(actor.id, 'influencer.payout_removed', 'Influencer', payout.influencerId, { payoutId: payout.id, amount: payout.amount })
    return json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to remove the payment', 400)
  }
}

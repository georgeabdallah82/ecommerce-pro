import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { json } from '@/lib/utils'
import { createPhoneReward, saveRewardsConfig } from '@/lib/rewards'
import { validateRewardsConfig } from '@/lib/rewards-shared'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Admin > Marketing > Rewards: save the settings (PUT), or make the thank-you code for one customer (POST).
export async function PUT(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const checked = validateRewardsConfig(await req.json().catch(() => ({})))
    if (!checked.ok) return json({ error: checked.error }, { status: 400, headers: NO_STORE })
    await saveRewardsConfig(checked.value)
    await audit(actor.id, 'rewards.updated', 'Setting', 'rewards.config', checked.value)
    return json({ ok: true, config: checked.value }, { headers: NO_STORE })
  } catch (error) {
    return routeError(error, 'Unable to save the rewards settings', 400)
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('coupons.manage')
    const body = await req.json().catch(() => ({})) as { phone?: unknown }
    const phone = String(body.phone ?? '').trim().slice(0, 30)
    if (!phone) return json({ error: 'Choose a customer.' }, { status: 400, headers: NO_STORE })
    const made = await createPhoneReward(phone)
    await audit(actor.id, 'rewards.code_made', 'PhoneReward', made.code, { phone: made.phone, percent: made.percent, delivered: made.delivered })
    return json({ ok: true, code: made.code, phone: made.phone, name: made.name, delivered: made.delivered, percent: made.percent, days: made.days, expiresAt: made.expiresAt.toISOString() }, { headers: NO_STORE })
  } catch (error) {
    // Plain refusals ("no reward waiting", "already made") are shown to the owner as they are.
    if (error instanceof Error && /^(Rewards are|That phone|This customer|This reward|Could not make)/.test(error.message)) return json({ error: error.message }, { status: 409, headers: NO_STORE })
    return routeError(error, 'Unable to make the code', 400)
  }
}

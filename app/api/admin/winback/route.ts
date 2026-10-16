import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { routeError } from '@/lib/api-error'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { WINBACK_CODE_KEY } from '@/lib/winback'

// Admin > Marketing > Win back: note that a customer was just messaged (the WhatsApp button), or
// save the discount code the message mentions.
export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const body = await req.json().catch(() => ({})) as { phone?: unknown; code?: unknown }
    if (body.code !== undefined) {
      const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)
      if (code && !await db.coupon.findUnique({ where: { code }, select: { id: true } })) return json({ error: `There is no discount code ${code}. Create it first in Discounts.` }, { status: 400 })
      await db.setting.upsert({ where: { key: WINBACK_CODE_KEY }, update: { value: code }, create: { key: WINBACK_CODE_KEY, value: code } })
      await audit(actor.id, 'winback.code_saved', 'Setting', WINBACK_CODE_KEY, { code })
      return json({ code })
    }
    const phone = String(body.phone || '').replace(/\D/g, '')
    if (phone.length < 8 || phone.length > 15) return json({ error: 'Invalid phone number' }, { status: 400 })
    const row = await db.winbackContact.upsert({ where: { phone }, update: { contactedAt: new Date() }, create: { phone } })
    return json({ contactedAt: row.contactedAt.toISOString() })
  } catch (error) {
    return routeError(error, 'Unable to save', 400)
  }
}

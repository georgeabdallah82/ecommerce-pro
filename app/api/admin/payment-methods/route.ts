import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { getPaymentMethodConfig } from '@/lib/payment-provider-config'

const fields = [
  'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
  'payment.bank.name', 'payment.bank.accountName', 'payment.bank.iban', 'payment.bank.instructions',
  'payment.wallet.provider', 'payment.wallet.accountName', 'payment.wallet.accountNumber', 'payment.wallet.instructions',
] as const

export async function GET() {
  try { await requirePermission('settings.view'); return json(await getPaymentMethodConfig()) }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json()
    const updates: Record<string,string> = {}
    for (const key of fields) {
      if (!(key in body)) continue
      const value = String(body[key] ?? '')
      if (value.length > 2000) return json({ error: `${key} is too long` }, { status: 400 })
      if (key.startsWith('payment.') && ['payment.cod','payment.card','payment.bank','payment.wallet'].includes(key)) {
        if (value !== 'true' && value !== 'false') return json({ error: `${key} must be true or false` }, { status: 400 })
      }
      updates[key] = value
    }
    for (const [key,value] of Object.entries(updates)) await db.setting.upsert({ where:{key}, update:{value}, create:{key,value} })
    await audit(actor.id, 'payment_methods.updated', 'PaymentSettings', 'methods', { keys: Object.keys(updates) })
    return json(await getPaymentMethodConfig())
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update payment methods' }, { status: 400 }) }
}

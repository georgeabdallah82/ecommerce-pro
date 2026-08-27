import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { decryptPaymentSecret, encryptPaymentSecret } from '@/lib/payment-config'
import { json } from '@/lib/utils'

const SECRET_KEY = 'payment.areeba.apiPassword'
const keys = {
  provider: 'payment.provider',
  enabled: 'payment.card',
  merchantId: 'payment.areeba.merchantId',
  merchantName: 'payment.areeba.merchantName',
  apiBaseUrl: 'payment.areeba.apiBaseUrl',
  apiVersion: 'payment.areeba.apiVersion',
  checkoutScriptUrl: 'payment.areeba.checkoutScriptUrl',
}

async function getConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(keys).concat(SECRET_KEY) } } })
  const map = new Map(rows.map(row => [row.key, row.value]))
  const encryptedPassword = map.get(SECRET_KEY) || ''
  let hasApiPassword = false
  if (encryptedPassword) {
    try { decryptPaymentSecret(encryptedPassword); hasApiPassword = true } catch { hasApiPassword = false }
  }
  return {
    provider: map.get(keys.provider) || 'manual',
    enabled: map.get(keys.enabled) !== 'false',
    merchantId: map.get(keys.merchantId) || '',
    merchantName: map.get(keys.merchantName) || '',
    apiBaseUrl: map.get(keys.apiBaseUrl) || 'https://epayment.areeba.com/api/rest',
    apiVersion: map.get(keys.apiVersion) || '78',
    checkoutScriptUrl: map.get(keys.checkoutScriptUrl) || 'https://epayment.areeba.com/static/checkout/checkout.min.js',
    hasApiPassword,
  }
}

export async function GET() {
  try {
    await requirePermission('settings.view')
    return json(await getConfig())
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await req.json()
    const provider = String(body.provider || 'manual').trim().toLowerCase()
    if (!['manual', 'areeba_mpgs'].includes(provider)) return json({ error: 'Unsupported payment provider' }, { status: 400 })

    const values: Record<string, string> = {
      [keys.provider]: provider,
      [keys.enabled]: String(Boolean(body.enabled)),
      [keys.merchantId]: String(body.merchantId || '').trim(),
      [keys.merchantName]: String(body.merchantName || '').trim().slice(0, 40),
      [keys.apiBaseUrl]: String(body.apiBaseUrl || 'https://epayment.areeba.com/api/rest').trim().replace(/\/$/, ''),
      [keys.apiVersion]: String(body.apiVersion || '78').trim(),
      [keys.checkoutScriptUrl]: String(body.checkoutScriptUrl || 'https://epayment.areeba.com/static/checkout/checkout.min.js').trim(),
    }
    if (provider === 'areeba_mpgs' && (!values[keys.merchantId] || !values[keys.merchantName])) {
      return json({ error: 'Merchant ID and merchant name are required for Areeba' }, { status: 400 })
    }
    for (const [key, value] of Object.entries(values)) await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

    const password = typeof body.apiPassword === 'string' ? body.apiPassword.trim() : ''
    if (password) {
      await db.setting.upsert({ where: { key: SECRET_KEY }, update: { value: encryptPaymentSecret(password) }, create: { key: SECRET_KEY, value: encryptPaymentSecret(password) } })
    }

    await audit(actor.id, 'payment_provider.updated', 'PaymentProvider', provider, {
      provider,
      enabled: values[keys.enabled],
      merchantId: values[keys.merchantId],
      apiPasswordChanged: Boolean(password),
    })
    return json(await getConfig())
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to update payment provider' }, { status: 400 })
  }
}

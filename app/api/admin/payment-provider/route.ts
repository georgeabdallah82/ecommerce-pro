import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { decryptPaymentSecret, encryptPaymentSecret } from '@/lib/payment-config'
import { json } from '@/lib/utils'

const SECRET_KEY = 'payment.areeba.apiPassword'
const DEFAULT_API_BASE_URL = 'https://epayment.areeba.com/api/rest'
const DEFAULT_CHECKOUT_SCRIPT_URL = 'https://epayment.areeba.com/static/checkout/checkout.min.js'
const keys = {
  provider: 'payment.provider',
  enabled: 'payment.card',
  merchantId: 'payment.areeba.merchantId',
  merchantName: 'payment.areeba.merchantName',
  apiBaseUrl: 'payment.areeba.apiBaseUrl',
  apiVersion: 'payment.areeba.apiVersion',
  checkoutScriptUrl: 'payment.areeba.checkoutScriptUrl',
}

function validateAreebaUrl(value: string, field: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'epayment.areeba.com') {
    throw new Error(`${field} must use the trusted Areeba HTTPS host`)
  }
  return parsed.toString().replace(/\/$/, '')
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
    apiBaseUrl: map.get(keys.apiBaseUrl) || DEFAULT_API_BASE_URL,
    apiVersion: map.get(keys.apiVersion) || '78',
    checkoutScriptUrl: map.get(keys.checkoutScriptUrl) || DEFAULT_CHECKOUT_SCRIPT_URL,
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

    const enabled = Boolean(body.enabled)
    const apiBaseUrl = validateAreebaUrl(String(body.apiBaseUrl || DEFAULT_API_BASE_URL).trim(), 'Areeba API base URL')
    const checkoutScriptUrl = validateAreebaUrl(String(body.checkoutScriptUrl || DEFAULT_CHECKOUT_SCRIPT_URL).trim(), 'Areeba checkout script URL')
    const apiVersion = String(body.apiVersion || '78').trim()
    if (!/^\d{1,3}$/.test(apiVersion)) return json({ error: 'Areeba API version must be numeric' }, { status: 400 })

    const merchantId = String(body.merchantId || '').trim().slice(0, 100)
    const merchantName = String(body.merchantName || '').trim().slice(0, 40)
    if (provider === 'areeba_mpgs' && (!merchantId || !merchantName)) {
      return json({ error: 'Merchant ID and merchant name are required for Areeba' }, { status: 400 })
    }

    const password = typeof body.apiPassword === 'string' ? body.apiPassword.trim() : ''
    if (provider === 'areeba_mpgs' && enabled && !password) {
      const existing = await db.setting.findUnique({ where: { key: SECRET_KEY }, select: { value: true } })
      if (!existing?.value) return json({ error: 'An Areeba API password is required before enabling card payments' }, { status: 400 })
      try { decryptPaymentSecret(existing.value) } catch { return json({ error: 'The stored Areeba API password is invalid; enter it again before enabling card payments' }, { status: 400 }) }
    }

    const values: Record<string, string> = {
      [keys.provider]: provider,
      [keys.enabled]: String(enabled),
      [keys.merchantId]: merchantId,
      [keys.merchantName]: merchantName,
      [keys.apiBaseUrl]: apiBaseUrl,
      [keys.apiVersion]: apiVersion,
      [keys.checkoutScriptUrl]: checkoutScriptUrl,
    }
    for (const [key, value] of Object.entries(values)) await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

    if (password) {
      if (password.length > 1000) return json({ error: 'Areeba API password is too long' }, { status: 400 })
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

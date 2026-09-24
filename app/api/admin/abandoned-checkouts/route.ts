import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'

export async function GET(req: Request) {
  try {
    await requirePermission('abandonedCheckouts.view')
    const params = new URL(req.url).searchParams
    const status = params.get('status') || undefined
    const rows = await db.abandonedCheckout.findMany({ where: status ? { status: status as any } : undefined, orderBy: { lastActivity: 'desc' }, take: 200 })
    return json(rows)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('abandonedCheckouts.manage')
    const b = await req.json()
    const token = String(b.token || '').trim()
    if (!token) return json({ error: 'Checkout token is required' }, { status: 400 })
    const cartJson = typeof b.cartJson === 'string' ? b.cartJson : JSON.stringify(b.cart || [])
    const currency = String(b.currency || await getStoreCurrency())
    const row = await db.abandonedCheckout.upsert({ where: { token }, update: { customerId: b.customerId ? String(b.customerId) : null, email: b.email ? String(b.email).trim() : null, cartJson, subtotal: Math.max(0, Math.trunc(Number(b.subtotal) || 0)), currency, recoveryUrl: b.recoveryUrl ? String(b.recoveryUrl) : null, status: 'OPEN', lastActivity: new Date() }, create: { token, customerId: b.customerId ? String(b.customerId) : null, email: b.email ? String(b.email).trim() : null, cartJson, subtotal: Math.max(0, Math.trunc(Number(b.subtotal) || 0)), currency, recoveryUrl: b.recoveryUrl ? String(b.recoveryUrl) : null } })
    await audit(actor.id, 'abandoned_checkout.saved', 'AbandonedCheckout', row.id, { token: row.token })
    return json({ checkout: row })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to save abandoned checkout' }, { status: 400 }) }
}

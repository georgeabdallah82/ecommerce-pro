import { randomBytes } from 'node:crypto'
import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function generateCode() { return randomBytes(10).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-') }

export async function GET(req: Request) {
  try {
    await requirePermission('giftCards.view')
    const q = new URL(req.url).searchParams.get('q')?.trim() || ''
    return json(await db.giftCard.findMany({ where: q ? { OR: [{ code: { contains: q.toUpperCase() } }, { last4: { contains: q.slice(-4) } }] } : undefined, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('giftCards.manage')
    const b = await req.json()
    const amount = Math.max(0, Math.trunc(Number(b.amount) || 0))
    if (!amount) return json({ error: 'Gift card amount must be greater than zero' }, { status: 400 })
    const code = String(b.code || generateCode()).trim().toUpperCase()
    const card = await db.giftCard.create({ data: { code, last4: code.replace(/[^A-Z0-9]/g, '').slice(-4), customerId: b.customerId ? String(b.customerId) : null, initialAmount: amount, balance: amount, currency: String(b.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD'), expiresAt: b.expiresAt ? new Date(b.expiresAt) : null, note: b.note ? String(b.note) : null } })
    await audit(actor.id, 'gift_card.created', 'GiftCard', card.id, { amount, customerId: card.customerId })
    return json({ giftCard: card }, { status: 201 })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create gift card' }, { status: 400 }) }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requirePermission('giftCards.manage')
    const b = await req.json()
    const id = String(b.id || '')
    if (!id) return json({ error: 'Gift card id is required' }, { status: 400 })
    const card = await db.giftCard.findUnique({ where: { id } })
    if (!card) return json({ error: 'Gift card not found' }, { status: 404 })
    if (b.adjustment !== undefined) {
      const delta = Math.trunc(Number(b.adjustment) || 0)
      const next = card.balance + delta
      if (next < 0 || next > card.initialAmount) return json({ error: 'Gift card balance adjustment is outside the allowed range' }, { status: 400 })
      const updated = await db.giftCard.update({ where: { id }, data: { balance: next } })
      await audit(actor.id, 'gift_card.adjusted', 'GiftCard', id, { delta, balance: next })
      return json({ giftCard: updated })
    }
    const updated = await db.giftCard.update({ where: { id }, data: { ...(b.status ? { status: b.status } : {}), ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}), ...(b.note !== undefined ? { note: b.note ? String(b.note) : null } : {}) } })
    await audit(actor.id, 'gift_card.updated', 'GiftCard', id, { fields: Object.keys(b) })
    return json({ giftCard: updated })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to update gift card' }, { status: 400 }) }
}

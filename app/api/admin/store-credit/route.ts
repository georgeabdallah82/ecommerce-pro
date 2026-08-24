import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(req: Request) {
  try {
    await requirePermission('customers.view')
    const customerId = new URL(req.url).searchParams.get('customerId')
    if (!customerId) return json({ error: 'customerId is required' }, { status: 400 })
    const rows = await db.storeCreditTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 200 })
    const balance = rows.reduce((sum, r) => sum + (r.type === 'CREDIT' ? r.amount : -r.amount), 0)
    return json({ balance: Math.max(0, balance), transactions: rows })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('customers.manage')
    const b = await req.json()
    const customerId = String(b.customerId || '')
    const amount = Math.max(0, Math.trunc(Number(b.amount) || 0))
    const type = b.type === 'DEBIT' ? 'DEBIT' : 'CREDIT'
    if (!customerId || !amount) return json({ error: 'customerId and a positive amount are required' }, { status: 400 })
    if (type === 'DEBIT') {
      const rows = await db.storeCreditTransaction.findMany({ where: { customerId }, select: { type: true, amount: true } })
      const balance = rows.reduce((sum, r) => sum + (r.type === 'CREDIT' ? r.amount : -r.amount), 0)
      if (balance < amount) return json({ error: 'Insufficient store credit balance' }, { status: 409 })
    }
    const tx = await db.storeCreditTransaction.create({ data: { customerId, type, amount, currency: String(b.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD'), referenceId: b.referenceId ? String(b.referenceId) : null, reason: b.reason ? String(b.reason) : null } })
    await audit(actor.id, 'store_credit.transaction', 'StoreCreditTransaction', tx.id, { customerId, type, amount })
    return json({ transaction: tx })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to create store credit transaction' }, { status: 400 }) }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  try {
    await requirePermission('storeCredit.view')
    const customerId = new URL(req.url).searchParams.get('customerId')
    if (!customerId) return json({ error: 'customerId is required' }, { status: 400 })
    const rows = await db.storeCreditTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 200 })
    const balance = rows.reduce((sum, r) => sum + (r.type === 'CREDIT' ? r.amount : -r.amount), 0)
    return json({ balance: Math.max(0, balance), transactions: rows })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 }) }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission('storeCredit.manage')
    const b = await req.json()
    const customerId = String(b.customerId || '')
    const amount = Math.max(0, Math.trunc(Number(b.amount) || 0))
    const type = b.type === 'DEBIT' ? 'DEBIT' : 'CREDIT'
    if (!customerId || !amount) return json({ error: 'customerId and a positive amount are required' }, { status: 400 })

    const created = await db.$transaction(async transaction => {
      if (type === 'DEBIT') {
        const rows = await transaction.storeCreditTransaction.findMany({ where: { customerId }, select: { type: true, amount: true } })
        const balance = rows.reduce((sum, r) => sum + (r.type === 'CREDIT' ? r.amount : -r.amount), 0)
        if (balance < amount) throw new Error('Insufficient store credit balance')
      }
      return transaction.storeCreditTransaction.create({ data: { customerId, type, amount, currency: String(b.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD'), referenceId: b.referenceId ? String(b.referenceId) : null, reason: b.reason ? String(b.reason) : null } })
    })

    await audit(actor.id, 'store_credit.transaction', 'StoreCreditTransaction', created.id, { customerId, type, amount })
    return json({ transaction: created })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'Insufficient store credit balance') return json({ error: message }, { status: 409 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      return json({ error: 'This transaction could not be completed due to a concurrent update. Please retry.' }, { status: 409 })
    }
    return json({ error: message || 'Unable to create store credit transaction' }, { status: 400 })
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true, name: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })
    const transactions = await db.storeCreditTransaction.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100 })
    const balance = transactions.reduce((sum, tx) => sum + tx.amount, 0)
    return json({ balance, transactions })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json()
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })
    const amount = Math.round(Number(body.amount))
    if (!Number.isInteger(amount) || amount === 0) return json({ error: 'Amount must be a non-zero integer in minor currency units.' }, { status: 400 })
    const transaction = await db.storeCreditTransaction.create({ data: {
      customerId: id,
      type: amount > 0 ? 'CREDIT' : 'DEBIT',
      amount,
      currency: String(body.currency || 'USD').toUpperCase(),
      reason: String(body.reason || 'Admin adjustment').trim().slice(0, 300),
      referenceId: body.referenceId ? String(body.referenceId) : null,
    } })
    await audit(actor.id, 'customer_store_credit.adjusted', 'User', id, { amount, type: transaction.type, reason: transaction.reason })
    const transactions = await db.storeCreditTransaction.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100 })
    const balance = transactions.reduce((sum, tx) => sum + tx.amount, 0)
    return json({ transaction, balance })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to adjust store credit' }, { status: 400 })
  }
}

import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { Prisma } from '@prisma/client'

function makeId() {
  return `coin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    const [aggregate, transactions] = await Promise.all([
      db.coinTransaction.aggregate({ where: { userId: id }, _sum: { amount: true } }),
      db.coinTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, amount: true, type: true, reason: true, referenceId: true, createdAt: true } }),
    ])
    return json({ balance: Math.max(0, Number(aggregate._sum.amount || 0)), transactions, redemptionRate: '1 coin = 0.01 store currency unit' }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[admin/customer-coins] GET failed', error)
    return json({ error: 'Unable to load customer coins' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })

    const amount = Math.trunc(Number(body.amount))
    const reason = String(body.reason || 'Admin adjustment').trim().slice(0, 300)
    const referenceId = body.referenceId ? String(body.referenceId).trim().slice(0, 190) : null
    if (!Number.isInteger(amount) || amount === 0) return json({ error: 'Coin adjustment must be a non-zero integer.' }, { status: 400 })
    if (Math.abs(amount) > 1_000_000_000) return json({ error: 'Coin adjustment is too large.' }, { status: 400 })
    if (referenceId === '') return json({ error: 'Reference id must not be empty.' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      const aggregate = await tx.coinTransaction.aggregate({ where: { userId: id }, _sum: { amount: true } })
      const balance = Math.max(0, Number(aggregate._sum.amount || 0))
      if (balance + amount < 0) throw new Error('Coin balance cannot become negative')

      if (referenceId) {
        const existing = await tx.coinTransaction.findFirst({
          where: { userId: id, referenceId, type: amount > 0 ? 'CREDIT' : 'DEBIT' },
          orderBy: { createdAt: 'asc' },
        })
        if (existing) return { transaction: existing, balance, idempotent: true }
      }

      const transaction = await tx.coinTransaction.create({
        data: {
          id: referenceId ? `coin_ref_${id}_${amount > 0 ? 'CREDIT' : 'DEBIT'}_${referenceId}`.slice(0, 190) : makeId(),
          userId: id,
          amount,
          type: amount > 0 ? 'CREDIT' : 'DEBIT',
          reason,
          referenceId,
        },
      })
      return { transaction, balance: balance + amount, idempotent: false }
    })

    if (!result.idempotent) {
      try {
        await audit(actor.id, 'customer_coins.adjusted', 'User', id, { amount, type: result.transaction.type, reason, referenceId })
      } catch (error) {
        console.error('[admin/customer-coins] audit failed after successful adjustment', error)
      }
    }
    return json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'UNAUTHORIZED') return json({ error: 'Unauthorized' }, { status: 401 })
    if (message === 'FORBIDDEN') return json({ error: 'Forbidden' }, { status: 403 })
    if (message === 'Coin balance cannot become negative') return json({ error: message }, { status: 409 })
    if (message.includes('Unique constraint')) return json({ error: 'A coin adjustment with this reference already exists.' }, { status: 409 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return json({ error: 'This adjustment could not be completed due to a concurrent update. Please retry.' }, { status: 409 })
    }
    console.error('[admin/customer-coins] POST failed', error)
    return json({ error: 'Unable to adjust customer coins' }, { status: 500 })
  }
}

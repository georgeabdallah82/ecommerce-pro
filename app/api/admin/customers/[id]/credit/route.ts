import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'
import { Prisma } from '@prisma/client'

const JSON_HEADERS = { 'Cache-Control': 'private, no-store' }
const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

function makeId() {
  return `wal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

async function getCustomer(id: string) {
  return db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('storeCredit.view')
    const { id } = await params
    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    // The displayed balance must be scoped to the same currency as the label next to it -- without
    // that, a customer with wallet transactions in more than one currency (an admin typo, or the
    // store's currency setting changed over time) saw a nonsensical cross-currency sum labeled with
    // just their most recent transaction's currency, diverging from what checkout's own
    // currency-scoped balance check treats as actually spendable.
    const currencyRow = await db.walletTransaction.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { currency: true } })
    const currency = currencyRow?.currency || await getStoreCurrency()
    const [transactions, aggregate] = await Promise.all([
      db.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, amount: true, currency: true, type: true, reason: true, referenceId: true, createdAt: true } }),
      db.walletTransaction.aggregate({ where: { userId: id, currency }, _sum: { amount: true } }),
    ])
    return json({
      balance: Number(aggregate._sum.amount || 0),
      currency,
      transactions,
    }, { headers: JSON_HEADERS })
  } catch (error) {
    console.error('[admin/customer-credit] GET failed', error)
    return json({ error: 'Unable to load customer wallet' }, { status: 500, headers: JSON_HEADERS })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('storeCredit.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const customer = await getCustomer(id)
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: JSON_HEADERS })

    const rawAmount = body?.amount
    const amount = typeof rawAmount === 'number'
      ? rawAmount
      : typeof rawAmount === 'string' && rawAmount.trim() !== ''
        ? Number(rawAmount)
        : NaN
    const currency = String(body?.currency || await getStoreCurrency()).trim().toUpperCase().slice(0, 10)
    const reason = String(body?.reason || 'Admin adjustment').trim().slice(0, 300)
    const referenceId = body?.referenceId ? String(body.referenceId).trim().slice(0, 190) : null

    if (!Number.isSafeInteger(amount) || amount === 0 || amount < INT32_MIN || amount > INT32_MAX) return json({ error: 'Amount must be a non-zero integer in minor currency units.' }, { status: 400, headers: JSON_HEADERS })
    if (!/^[A-Z]{3,10}$/.test(currency)) return json({ error: 'Invalid currency.' }, { status: 400, headers: JSON_HEADERS })
    if (referenceId === '') return json({ error: 'Reference id must not be empty.' }, { status: 400, headers: JSON_HEADERS })

    const result = await db.$transaction(async tx => {
      const aggregate = await tx.walletTransaction.aggregate({ where: { userId: id, currency }, _sum: { amount: true } })
      const balance = Number(aggregate._sum.amount || 0)
      if (balance + amount < 0) throw new Error('Wallet balance cannot become negative')
      if (balance + amount > INT32_MAX) throw new Error('Wallet balance exceeds the supported limit')

      if (referenceId) {
        const existing = await tx.walletTransaction.findFirst({
          where: { userId: id, referenceId, type: amount > 0 ? 'CREDIT' : 'DEBIT' },
          orderBy: { createdAt: 'asc' },
        })
        if (existing) return { transaction: existing, balance, idempotent: true }
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          id: referenceId ? `wal_ref_${id}_${currency}_${amount > 0 ? 'CREDIT' : 'DEBIT'}_${referenceId}`.slice(0, 190) : makeId(),
          userId: id,
          amount,
          currency,
          type: amount > 0 ? 'CREDIT' : 'DEBIT',
          reason,
          referenceId,
        },
      })
      return { transaction, balance: balance + amount, idempotent: false }
    })

    if (!result.idempotent) {
      try {
        await audit(actor.id, 'customer_wallet.adjusted', 'User', id, { amount, currency, type: result.transaction.type, reason, referenceId })
      } catch (error) {
        console.error('[admin/customer-credit] audit failed after successful adjustment', error)
      }
    }

    return json(result, { headers: JSON_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Wallet balance cannot become negative' || message === 'Wallet balance exceeds the supported limit') return json({ error: message }, { status: 409, headers: JSON_HEADERS })
    if (message.includes('Unique constraint')) return json({ error: 'A wallet adjustment with this reference already exists.' }, { status: 409, headers: JSON_HEADERS })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return json({ error: 'This adjustment could not be completed due to a concurrent update. Please retry.' }, { status: 409, headers: JSON_HEADERS })
    }
    console.error('[admin/customer-credit] POST failed', error)
    return json({ error: 'Unable to adjust customer wallet' }, { status: 500, headers: JSON_HEADERS })
  }
}

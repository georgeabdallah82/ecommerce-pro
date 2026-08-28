import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function makeId() {
  return `wal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })

    const transactions = await db.$queryRaw<Array<{
      id: string; amount: number; currency: string; type: string; reason: string | null; referenceId: string | null; createdAt: Date
    }>>`
      SELECT "id", "amount", "currency", "type", "reason", "referenceId", "createdAt"
      FROM "WalletTransaction"
      WHERE "userId" = ${id}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `
    const balanceRows = await db.$queryRaw<Array<{ amount: number; currency: string }>>`
      SELECT COALESCE(SUM("amount"), 0)::int AS amount,
             COALESCE(MAX("currency"), ${process.env.NEXT_PUBLIC_CURRENCY || 'USD'}) AS currency
      FROM "WalletTransaction"
      WHERE "userId" = ${id}
    `
    return json({ balance: Number(balanceRows[0]?.amount || 0), currency: balanceRows[0]?.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD', transactions }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[admin/customer-credit] GET failed', error)
    return json({ error: 'Unable to load customer wallet' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('customers.manage')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404 })

    const amount = Math.round(Number(body.amount))
    const currency = String(body.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD').trim().toUpperCase().slice(0, 10)
    const reason = String(body.reason || 'Admin adjustment').trim().slice(0, 300)
    const referenceId = body.referenceId ? String(body.referenceId).trim().slice(0, 190) : null
    if (!Number.isInteger(amount) || amount === 0) return json({ error: 'Amount must be a non-zero integer in minor currency units.' }, { status: 400 })
    if (!/^[A-Z]{3,10}$/.test(currency)) return json({ error: 'Invalid currency.' }, { status: 400 })

    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${id}:${currency}`}))`
      const balanceRows = await tx.$queryRaw<Array<{ amount: number }>>`
        SELECT COALESCE(SUM("amount"), 0)::int AS amount
        FROM "WalletTransaction"
        WHERE "userId" = ${id} AND "currency" = ${currency}
      `
      const balance = Number(balanceRows[0]?.amount || 0)
      if (balance + amount < 0) throw new Error('Wallet balance cannot become negative')

      const transactionId = makeId()
      await tx.$executeRaw`
        INSERT INTO "WalletTransaction" ("id", "userId", "amount", "currency", "type", "reason", "referenceId")
        VALUES (${transactionId}, ${id}, ${amount}, ${currency}, ${amount > 0 ? 'CREDIT' : 'DEBIT'}, ${reason}, ${referenceId})
      `
      const rows = await tx.$queryRaw<Array<{ id: string; amount: number; currency: string; type: string; reason: string | null; referenceId: string | null; createdAt: Date }>>`
        SELECT "id", "amount", "currency", "type", "reason", "referenceId", "createdAt"
        FROM "WalletTransaction" WHERE "id" = ${transactionId}
      `
      return { transaction: rows[0], balance: balance + amount }
    })

    await audit(actor.id, 'customer_wallet.adjusted', 'User', id, { amount, currency, type: result.transaction.type, reason })
    return json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Wallet balance cannot become negative') return json({ error: message }, { status: 409 })
    console.error('[admin/customer-credit] POST failed', error)
    return json({ error: 'Unable to adjust customer wallet' }, { status: 500 })
  }
}

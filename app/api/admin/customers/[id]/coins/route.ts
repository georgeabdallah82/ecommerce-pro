import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { json } from '@/lib/utils'

function makeId() {
  return `coin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('customers.view')
    const { id } = await params
    const customer = await db.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) return json({ error: 'Customer not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    const balanceRows = await db.$queryRaw<Array<{ amount: number }>>`
      SELECT COALESCE(SUM("amount"), 0)::int AS amount FROM "CoinTransaction" WHERE "userId" = ${id}
    `
    const transactions = await db.$queryRaw<Array<{
      id: string; amount: number; type: string; reason: string | null; referenceId: string | null; createdAt: Date
    }>>`
      SELECT "id", "amount", "type", "reason", "referenceId", "createdAt"
      FROM "CoinTransaction" WHERE "userId" = ${id}
      ORDER BY "createdAt" DESC LIMIT 100
    `
    return json({ balance: Math.max(0, Number(balanceRows[0]?.amount || 0)), transactions, redemptionRate: '1 coin = 0.01 store currency unit' }, {
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

    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coins:${id}`}))`
      const balanceRows = await tx.$queryRaw<Array<{ amount: number }>>`
        SELECT COALESCE(SUM("amount"), 0)::int AS amount FROM "CoinTransaction" WHERE "userId" = ${id}
      `
      const balance = Math.max(0, Number(balanceRows[0]?.amount || 0))
      if (balance + amount < 0) throw new Error('Coin balance cannot become negative')
      const transactionId = makeId()
      await tx.$executeRaw`
        INSERT INTO "CoinTransaction" ("id", "userId", "amount", "type", "reason", "referenceId")
        VALUES (${transactionId}, ${id}, ${amount}, ${amount > 0 ? 'CREDIT' : 'DEBIT'}, ${reason}, ${referenceId})
      `
      const rows = await tx.$queryRaw<Array<{ id: string; amount: number; type: string; reason: string | null; referenceId: string | null; createdAt: Date }>>`
        SELECT "id", "amount", "type", "reason", "referenceId", "createdAt" FROM "CoinTransaction" WHERE "id" = ${transactionId}
      `
      return { transaction: rows[0], balance: balance + amount }
    })

    try {
      await audit(actor.id, 'customer_coins.adjusted', 'User', id, { amount, type: result.transaction.type, reason, referenceId })
    } catch (error) {
      console.error('[admin/customer-coins] audit failed after successful adjustment', error)
    }
    return json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Coin balance cannot become negative') return json({ error: message }, { status: 409 })
    console.error('[admin/customer-coins] POST failed', error)
    return json({ error: 'Unable to adjust customer coins' }, { status: 500 })
  }
}

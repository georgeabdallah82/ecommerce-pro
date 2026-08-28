import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await db.$queryRaw<Array<{ amount: number; currency: string }>>`
      SELECT COALESCE(SUM("amount"), 0)::int AS amount,
             COALESCE(MAX("currency"), ${process.env.NEXT_PUBLIC_CURRENCY || 'USD'}) AS currency
      FROM "WalletTransaction"
      WHERE "userId" = ${user.id}
    `
    const transactions = await db.$queryRaw<Array<{
      id: string
      amount: number
      currency: string
      type: string
      reason: string | null
      referenceId: string | null
      createdAt: Date
    }>>`
      SELECT "id", "amount", "currency", "type", "reason", "referenceId", "createdAt"
      FROM "WalletTransaction"
      WHERE "userId" = ${user.id}
      ORDER BY "createdAt" DESC
      LIMIT 50
    `
    return json({
      balance: Number(rows[0]?.amount || 0),
      currency: rows[0]?.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD',
      transactions,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to load wallet' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}

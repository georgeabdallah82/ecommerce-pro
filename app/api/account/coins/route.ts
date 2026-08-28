import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await db.$queryRaw<Array<{ amount: number }>>`
      SELECT COALESCE(SUM("amount"), 0)::int AS amount
      FROM "CoinTransaction"
      WHERE "userId" = ${user.id}
    `
    const transactions = await db.$queryRaw<Array<{
      id: string
      amount: number
      type: string
      reason: string | null
      referenceId: string | null
      createdAt: Date
    }>>`
      SELECT "id", "amount", "type", "reason", "referenceId", "createdAt"
      FROM "CoinTransaction"
      WHERE "userId" = ${user.id}
      ORDER BY "createdAt" DESC
      LIMIT 50
    `
    return json({
      balance: Math.max(0, Number(rows[0]?.amount || 0)),
      transactions,
      redemptionRate: '1 coin = 0.01 store currency unit',
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return json({ error: message === 'UNAUTHORIZED' ? 'Unauthorized' : 'Unable to load coins' }, {
      status: message === 'UNAUTHORIZED' ? 401 : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}

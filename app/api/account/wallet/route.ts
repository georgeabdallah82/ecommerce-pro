import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'
import { getStoreCurrency } from '@/lib/store-currency'

export async function GET() {
  try {
    const user = await requireUser()
    // The displayed balance must be scoped to the same currency as the label next to it -- without
    // that, a wallet with transactions in more than one currency showed a nonsensical cross-currency
    // sum labeled with just the most recent transaction's currency, matching the admin credit
    // route's own bug (see app/api/admin/customers/[id]/credit/route.ts).
    const currencyRow = await db.walletTransaction.findFirst({where:{userId:user.id},orderBy:{createdAt:'desc'},select:{currency:true}})
    const currency = currencyRow?.currency || await getStoreCurrency()
    const [aggregate, transactions] = await Promise.all([
      db.walletTransaction.aggregate({where:{userId:user.id,currency},_sum:{amount:true}}),
      db.walletTransaction.findMany({
        where:{userId:user.id},
        orderBy:{createdAt:'desc'},
        take:50,
        select:{id:true,amount:true,currency:true,type:true,reason:true,referenceId:true,createdAt:true},
      }),
    ])
    return json({
      balance: Number(aggregate._sum.amount || 0),
      currency,
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

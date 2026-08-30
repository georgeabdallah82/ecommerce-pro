import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    const user = await requireUser()
    const [aggregate, currencyRow, transactions] = await Promise.all([
      db.walletTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
      db.walletTransaction.findFirst({where:{userId:user.id},orderBy:{createdAt:'desc'},select:{currency:true}}),
      db.walletTransaction.findMany({
        where:{userId:user.id},
        orderBy:{createdAt:'desc'},
        take:50,
        select:{id:true,amount:true,currency:true,type:true,reason:true,referenceId:true,createdAt:true},
      }),
    ])
    return json({
      balance: Number(aggregate._sum.amount || 0),
      currency: currencyRow?.currency || process.env.NEXT_PUBLIC_CURRENCY || 'USD',
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

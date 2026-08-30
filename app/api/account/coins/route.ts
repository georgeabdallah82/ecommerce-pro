import { db } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'
import { json } from '@/lib/utils'

export async function GET() {
  try {
    const user = await requireUser()
    const [aggregate, transactions] = await Promise.all([
      db.coinTransaction.aggregate({where:{userId:user.id},_sum:{amount:true}}),
      db.coinTransaction.findMany({
        where:{userId:user.id},
        orderBy:{createdAt:'desc'},
        take:50,
        select:{id:true,amount:true,type:true,reason:true,referenceId:true,createdAt:true},
      }),
    ])
    return json({
      balance: Math.max(0, Number(aggregate._sum.amount || 0)),
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

import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CustomerDetailAdmin from '@/components/customer-detail-admin'
import '../customer-detail.css'

type WalletTransaction = {
  id: string
  amount: number
  currency: string
  type: string
  reason: string | null
  referenceId: string | null
  createdAt: Date
}

type CoinTransaction = {
  id: string
  amount: number
  type: string
  reason: string | null
  referenceId: string | null
  createdAt: Date
}

async function loadWalletAndCoins(id: string) {
  try {
    const [walletTransactions, coinTransactions] = await Promise.all([
      db.$queryRaw<WalletTransaction[]>`
        SELECT "id", "amount", "currency", "type", "reason", "referenceId", "createdAt"
        FROM "WalletTransaction" WHERE "userId" = ${id}
        ORDER BY "createdAt" DESC LIMIT 100
      `,
      db.$queryRaw<CoinTransaction[]>`
        SELECT "id", "amount", "type", "reason", "referenceId", "createdAt"
        FROM "CoinTransaction" WHERE "userId" = ${id}
        ORDER BY "createdAt" DESC LIMIT 100
      `,
    ])
    return { walletTransactions, coinTransactions, loyaltyTablesAvailable: true }
  } catch (error) {
    console.error('[admin/customer-detail] loyalty data unavailable', error)
    return {
      walletTransactions: [] as WalletTransaction[],
      coinTransactions: [] as CoinTransaction[],
      loyaltyTablesAvailable: false,
    }
  }
}

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('customers.view')
  const { id } = await params
  const customer = await db.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    include: {
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
      orders: { orderBy: { createdAt: 'desc' }, include: { items: true } },
      reviews: { orderBy: { createdAt: 'desc' }, include: { product: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { orders: true, reviews: true } },
    },
  })
  if (!customer) return <div className="empty">Customer not found.</div>

  const [tagMembers, segmentMembers, loyalty, availableTags, availableSegments] = await Promise.all([
    db.customerTagMember.findMany({ where: { customerId: id }, include: { tag: true }, orderBy: { createdAt: 'desc' } }),
    db.customerSegmentMember.findMany({ where: { customerId: id }, include: { segment: true }, orderBy: { addedAt: 'desc' } }),
    loadWalletAndCoins(id),
    db.customerTag.findMany({ orderBy: { value: 'asc' } }),
    db.customerSegment.findMany({ orderBy: { name: 'asc' } }),
  ])

  const orderTotal = customer.orders.reduce((sum, order) => sum + order.grandTotal, 0)
  const walletBalance = loyalty.walletTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const coinBalance = Math.max(0, loyalty.coinTransactions.reduce((sum, tx) => sum + tx.amount, 0))
  const serialized = JSON.parse(JSON.stringify({
    ...customer,
    passwordHash: undefined,
    orderTotal,
    tags: tagMembers.map(x => x.tag),
    segments: segmentMembers.map(x => x.segment),
    creditTransactions: loyalty.walletTransactions,
    creditBalance: walletBalance,
    coinTransactions: loyalty.coinTransactions,
    coinBalance,
    loyaltyTablesAvailable: loyalty.loyaltyTablesAvailable,
    availableTags,
    availableSegments,
  }))
  return <CustomerDetailAdmin initial={serialized} />
}

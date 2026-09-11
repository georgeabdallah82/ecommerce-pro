import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CustomerDetailAdmin from '@/components/customer-detail-admin'
import { sumCustomerSpend } from '@/lib/orders'
import type { OrderStatus } from '@prisma/client'
import ui from '@/components/admin-ui.module.css'

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
      db.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, amount: true, currency: true, type: true, reason: true, referenceId: true, createdAt: true } }),
      db.coinTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, amount: true, type: true, reason: true, referenceId: true, createdAt: true } }),
    ])
    return { walletTransactions, coinTransactions, loyaltyTablesAvailable: true }
  } catch (error) {
    console.error('[admin/customer-detail] loyalty data unavailable', error)
    return { walletTransactions: [] as WalletTransaction[], coinTransactions: [] as CoinTransaction[], loyaltyTablesAvailable: false }
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
  if (!customer) return <div className={ui.empty}>Customer not found.</div>

  const [tagMembers, segmentMembers, loyalty, availableTags, availableSegments] = await Promise.all([
    db.customerTagMember.findMany({ where: { customerId: id }, include: { tag: true }, orderBy: { createdAt: 'desc' } }),
    db.customerSegmentMember.findMany({ where: { customerId: id }, include: { segment: true }, orderBy: { addedAt: 'desc' } }),
    loadWalletAndCoins(id),
    db.customerTag.findMany({ orderBy: { value: 'asc' } }),
    db.customerSegment.findMany({ orderBy: { name: 'asc' } }),
  ])

  // Extended (Accelerate) client payload inference doesn't always widen nested `include`
  // relations correctly, so this access is asserted to the shape actually queried.
  const orderTotal = sumCustomerSpend((customer as unknown as { orders: { status: OrderStatus; grandTotal: number }[] }).orders)
  const walletBalance = loyalty.walletTransactions.reduce((sum: number, tx: WalletTransaction) => sum + tx.amount, 0)
  const coinBalance = Math.max(0, loyalty.coinTransactions.reduce((sum: number, tx: CoinTransaction) => sum + tx.amount, 0))
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

import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CustomerDetailAdmin from '@/components/customer-detail-admin'

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

  const [tagMembers, segmentMembers, creditTransactions, availableTags, availableSegments] = await Promise.all([
    db.customerTagMember.findMany({ where: { customerId: id }, include: { tag: true }, orderBy: { createdAt: 'desc' } }),
    db.customerSegmentMember.findMany({ where: { customerId: id }, include: { segment: true }, orderBy: { addedAt: 'desc' } }),
    db.storeCreditTransaction.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.customerTag.findMany({ orderBy: { value: 'asc' } }),
    db.customerSegment.findMany({ orderBy: { name: 'asc' } }),
  ])

  const orderTotal = customer.orders.reduce((sum, order) => sum + order.grandTotal, 0)
  const creditBalance = creditTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const serialized = JSON.parse(JSON.stringify({
    ...customer,
    passwordHash: undefined,
    orderTotal,
    tags: tagMembers.map(x => x.tag),
    segments: segmentMembers.map(x => x.segment),
    creditTransactions,
    creditBalance,
    availableTags,
    availableSegments,
  }))
  return <CustomerDetailAdmin initial={serialized} />
}

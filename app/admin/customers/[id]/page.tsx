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
  const orderTotal = customer.orders.reduce((sum, order) => sum + order.grandTotal, 0)
  const serialized = JSON.parse(JSON.stringify({ ...customer, passwordHash: undefined, orderTotal }))
  return <CustomerDetailAdmin initial={serialized} />
}

import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CustomersAdmin from '@/components/customers-admin'

export default async function Customers() {
  await requirePermission('customers.view')
  const [total, active, disabled, rows] = await Promise.all([
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.user.count({ where: { role: 'CUSTOMER', isActive: true } }),
    db.user.count({ where: { role: 'CUSTOMER', isActive: false } }),
    db.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true, lastLoginAt: true, _count: { select: { orders: true, reviews: true } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ])
  return <CustomersAdmin initial={{ rows, total, active, disabled, page: 1, pages: Math.max(1, Math.ceil(total / 25)), pageSize: 25 }} />
}

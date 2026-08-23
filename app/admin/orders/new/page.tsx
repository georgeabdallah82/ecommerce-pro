import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ManualOrderForm from '@/components/manual-order-form'

export default async function NewManualOrderPage() {
  await requirePermission('orders.manage')
  const [products, customers] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } }, orderBy: { name: 'asc' }, take: 500 }),
    db.user.findMany({ where: { role: 'CUSTOMER', isActive: true }, select: { id: true, name: true, email: true, phone: true }, orderBy: { name: 'asc' }, take: 500 }),
  ])
  return <ManualOrderForm products={products} customers={customers} />
}

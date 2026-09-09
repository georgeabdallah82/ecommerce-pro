import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import DraftOrderForm from '@/components/draft-order-form'

export default async function NewDraftOrderPage() {
  await requirePermission('draftOrders.manage')
  const [products, customers] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true }, orderBy: { name: 'asc' }, take: 500 }),
    db.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true, phone: true }, orderBy: { name: 'asc' }, take: 500 }),
  ])
  return <DraftOrderForm products={JSON.parse(JSON.stringify(products))} customers={JSON.parse(JSON.stringify(customers))} />
}

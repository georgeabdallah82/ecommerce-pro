import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import OrderEditForm from '@/components/order-edit-form'
import ui from '@/components/admin-ui.module.css'

export default async function NewOrderEditPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  await requirePermission('orderEdits.manage')
  const { orderId } = await searchParams
  if (!orderId) {
    return (
      <div className={ui.empty}>
        <strong>No order selected</strong>
        <p className={ui.muted}>Start an order edit from an order's detail page.</p>
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders" style={{ marginTop: 12, display: 'inline-flex' }}>Go to orders</Link>
      </div>
    )
  }
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true, variant: true } } } })
  if (!order) {
    return (
      <div className={ui.empty}>
        <strong>Order not found</strong>
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders" style={{ marginTop: 12, display: 'inline-flex' }}>Go to orders</Link>
      </div>
    )
  }
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    return (
      <div className={ui.empty}>
        <strong>This order cannot be edited</strong>
        <p className={ui.muted}>Cancelled or fully refunded orders cannot be edited.</p>
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/admin/orders/${order.id}`} style={{ marginTop: 12, display: 'inline-flex' }}>Back to order</Link>
      </div>
    )
  }
  const products = await db.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true }, orderBy: { name: 'asc' }, take: 500 })
  return <OrderEditForm order={JSON.parse(JSON.stringify(order))} products={JSON.parse(JSON.stringify(products))} />
}

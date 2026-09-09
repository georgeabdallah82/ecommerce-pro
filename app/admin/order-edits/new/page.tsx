import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import OrderEditForm from '@/components/order-edit-form'

export default async function NewOrderEditPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  await requirePermission('orderEdits.manage')
  const { orderId } = await searchParams
  if (!orderId) {
    return (
      <div className="empty">
        <strong>No order selected</strong>
        <p className="muted">Start an order edit from an order's detail page.</p>
        <Link className="btn secondary" href="/admin/orders" style={{ marginTop: 12, display: 'inline-flex' }}>Go to orders</Link>
      </div>
    )
  }
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true, variant: true } } } })
  if (!order) {
    return (
      <div className="empty">
        <strong>Order not found</strong>
        <Link className="btn secondary" href="/admin/orders" style={{ marginTop: 12, display: 'inline-flex' }}>Go to orders</Link>
      </div>
    )
  }
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    return (
      <div className="empty">
        <strong>This order cannot be edited</strong>
        <p className="muted">Cancelled or fully refunded orders cannot be edited.</p>
        <Link className="btn secondary" href={`/admin/orders/${order.id}`} style={{ marginTop: 12, display: 'inline-flex' }}>Back to order</Link>
      </div>
    )
  }
  const products = await db.product.findMany({ where: { status: 'ACTIVE' }, include: { variants: true }, orderBy: { name: 'asc' }, take: 500 })
  return <OrderEditForm order={JSON.parse(JSON.stringify(order))} products={JSON.parse(JSON.stringify(products))} />
}

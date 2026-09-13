import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { PurchaseTracker } from '@/components/purchase-tracker'

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string; email?: string }> }) {
  const { order, email } = await searchParams
  if (!order) notFound()
  const user = await getCurrentUser()
  const viewOrderHref = user ? `/account/orders/${encodeURIComponent(order)}` : email ? `/account/orders/${encodeURIComponent(order)}?email=${encodeURIComponent(email)}` : null

  const record = await db.order.findUnique({
    where: { orderNumber: order },
    select: { orderNumber: true, grandTotal: true, currency: true, items: { select: { name: true, sku: true, quantity: true, unitPrice: true } } },
  })

  return <main className="section"><div className="container"><div className="card successCard">
    <span className="pill">ORDER CONFIRMED</span>
    <h1 className="h2">Thank you for your order.</h1>
    <p className="body muted">Your order number is <strong>#{order}</strong>. Keep it for your records.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Link className="btn" href="/shop">Continue shopping</Link>
      {viewOrderHref && <Link className="btn secondary" href={viewOrderHref}>View order</Link>}
      {user ? <Link className="btn secondary" href="/account">View account</Link> : <Link className="btn secondary" href="/account/register">Create an account to track future orders</Link>}
    </div>
  </div></div>
  {record && <PurchaseTracker
    orderNumber={record.orderNumber}
    value={record.grandTotal / 100}
    currency={record.currency}
    items={record.items.map(i => ({ name: i.name, sku: i.sku, price: i.unitPrice / 100, quantity: i.quantity }))}
  />}
  </main>
}

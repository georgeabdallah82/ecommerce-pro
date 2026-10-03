import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { PurchaseTracker } from '@/components/purchase-tracker'
import { StoreFooter } from '@/components/store-footer'

export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string; email?: string; payment?: string }> }) {
  const { order, email, payment } = await searchParams
  if (!order) notFound()
  const user = await getCurrentUser()
  const viewOrderHref = user ? `/account/orders/${encodeURIComponent(order)}` : email ? `/account/orders/${encodeURIComponent(order)}?email=${encodeURIComponent(email)}` : null

  const record = await db.order.findUnique({
    where: { orderNumber: order },
    select: { orderNumber: true, grandTotal: true, currency: true, status: true, paymentStatus: true, paymentMethod: true, items: { select: { name: true, sku: true, quantity: true, unitPrice: true } } },
  })
  // The card gateway sends customers here for every outcome (?payment=paid|failed|pending).
  // A failed or cancelled order must not read as "confirmed" or be reported as a sale.
  const failed = payment === 'failed' || record?.paymentStatus === 'FAILED' || record?.status === 'CANCELLED'
  const processing = !failed && record?.paymentMethod === 'CARD' && record.paymentStatus !== 'PAID'

  if (failed) {
    return <><main className="section"><div className="container"><div className="card successCard">
      <span className="pill">PAYMENT NOT COMPLETED</span>
      <h1 className="h2">Your payment didn't go through.</h1>
      <p className="body muted">You haven't been charged for order <strong>#{order}</strong>. You can try again with another card or choose cash on delivery.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href="/cart">Back to cart</Link>
        <Link className="btn secondary" href="/shop">Continue shopping</Link>
      </div>
    </div></div></main><StoreFooter /></>
  }

  return <><main className="section"><div className="container"><div className="card successCard">
    <span className="pill">{processing ? 'PAYMENT PROCESSING' : 'ORDER CONFIRMED'}</span>
    <h1 className="h2">Thank you for your order.</h1>
    {processing && <p className="body muted">We're waiting for your bank to confirm the payment. You'll get an email as soon as it does.</p>}
    <p className="body muted">Your order number is <strong>#{order}</strong>. Keep it for your records.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Link className="btn" href="/shop">Continue shopping</Link>
      {viewOrderHref && <Link className="btn secondary" href={viewOrderHref}>View order</Link>}
      {user ? <Link className="btn secondary" href="/account">View account</Link> : <Link className="btn secondary" href="/account/register">Create an account to track future orders</Link>}
    </div>
  </div></div>
  {record && !processing && <PurchaseTracker
    orderNumber={record.orderNumber}
    value={record.grandTotal / 100}
    currency={record.currency}
    items={record.items.map(i => ({ name: i.name, sku: i.sku, price: i.unitPrice / 100, quantity: i.quantity }))}
  />}
  </main><StoreFooter /></>
}

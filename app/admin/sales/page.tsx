import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { money } from '@/lib/config'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreCurrency } from '@/lib/store-currency'
import { salesWhere, type SalesFilters } from '@/lib/sales-list'

export const dynamic = 'force-dynamic'

const LIMIT = 100
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']
const PAYMENTS = ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']

// Online orders and till sales in one list. Every filter is applied on the server.
export default async function SalesPage({ searchParams }: { searchParams: Promise<SalesFilters> }) {
  await requirePermission('orders.view')
  const filters = await searchParams
  const [timezone, currency, products] = await Promise.all([
    getStoreTimezone(),
    getStoreCurrency(),
    db.product.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 300 }),
  ])
  const where = salesWhere(filters, timezone)
  const [rows, totals] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: {
        id: true, orderNumber: true, channel: true, createdAt: true, grandTotal: true, status: true, paymentStatus: true,
        email: true, user: { select: { name: true } }, cashier: { select: { name: true } }, items: { select: { quantity: true } },
      },
    }),
    db.order.aggregate({ where, _count: { _all: true }, _sum: { grandTotal: true } }),
  ])
  const shown = rows.length
  const formatDate = (date: Date) => new Date(date).toLocaleString('en-GB', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' })
  const field = { minHeight: 40, padding: '0 10px', borderRadius: 8, border: '1px solid #cfcfc8', font: 'inherit', minWidth: 0 } as const

  return (
    <section style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Sales</h1>
        <p style={{ color: '#5f6673', margin: 0 }}>Online orders and till sales together. Filter by channel, status, payment, date, product, customer or search.</p>
      </header>

      <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end', border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 14 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Channel
          <select name="channel" defaultValue={filters.channel ?? ''} style={field}>
            <option value="">All</option><option value="ONLINE">Online store</option><option value="POS">Till (POS)</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Order status
          <select name="status" defaultValue={filters.status ?? ''} style={field}>
            <option value="">Any</option>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Payment
          <select name="payment" defaultValue={filters.payment ?? ''} style={field}>
            <option value="">Any</option>{PAYMENTS.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Product
          <select name="productId" defaultValue={filters.productId ?? ''} style={field}>
            <option value="">Any product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>From
          <input type="date" name="from" defaultValue={filters.from ?? ''} style={field} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>To
          <input type="date" name="to" defaultValue={filters.to ?? ''} style={field} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, gridColumn: 'span 2' }}>Search
          <input type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Order number, customer name, email or phone" style={field} />
        </label>
        <input type="hidden" name="customerId" value={filters.customerId ?? ''} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ ...field, background: '#171717', color: '#fff', border: '1px solid #171717', cursor: 'pointer' }}>Apply</button>
          <Link href="/admin/sales" style={{ ...field, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: '#171717' }}>Reset</Link>
        </div>
      </form>

      <p role="status" style={{ margin: 0, color: '#5f6673' }}>
        {totals._count._all} {totals._count._all === 1 ? 'sale' : 'sales'} · order value {money(totals._sum.grandTotal ?? 0, currency)}
        {totals._count._all > shown ? ` · showing the latest ${shown}` : ''}
      </p>

      <div style={{ border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ margin: 0, padding: 16, color: '#5f6673' }}>No sales match these filters.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5f6673', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <th style={{ padding: '10px 12px' }}>Date</th><th>Channel</th><th>Order</th><th>Customer</th><th>Items</th><th style={{ textAlign: 'right' }}>Total</th><th>Payment</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const href = row.channel === 'POS' ? `/admin/pos/receipts/${encodeURIComponent(row.orderNumber)}` : `/admin/orders/${row.id}`
                const who = row.user?.name || row.email
                return (
                  <tr key={row.id} style={{ borderTop: '1px solid #f0f0ec' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDate(row.createdAt)}</td>
                    <td>{row.channel === 'POS' ? 'Till' : 'Online'}{row.channel === 'POS' && row.cashier ? <span style={{ display: 'block', color: '#5f6673', fontSize: 12 }}>{row.cashier.name}</span> : null}</td>
                    <td><Link href={href} style={{ color: '#171717', fontWeight: 600 }}>{row.orderNumber}</Link></td>
                    <td>{who}</td>
                    <td>{row.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(row.grandTotal, currency)}</td>
                    <td>{label(row.paymentStatus)}</td>
                    <td>{label(row.status)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getInvoiceStore } from '@/lib/invoice'
import PackingSlips, { type SlipOrder } from '@/components/packing-slips'
import ui from '@/components/admin-ui.module.css'

export const dynamic = 'force-dynamic'

// Packing slips (?ids=a,b,c): what goes inside each parcel -- the items and the delivery details,
// never the prices, and the customer's gift message when it is a gift. One slip per page.
export default async function PackingSlipsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requirePermission('orders.view')
  const ids = String((await searchParams).ids || '').split(',').map(id => id.trim()).filter(Boolean).slice(0, 100)
  if (!ids.length) return <div className={ui.empty}>Choose orders on the delivery sheet or open an order, then print its packing slip.</div>
  const [rows, store, timezone] = await Promise.all([
    db.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true, createdAt: true, phone: true, email: true, shippingAddressJson: true, shippingMethod: true, isGift: true, giftMessage: true, user: { select: { name: true } }, items: { select: { id: true, name: true, quantity: true, variant: { select: { name: true } } } } },
    }),
    getInvoiceStore(),
    getStoreTimezone(),
  ])
  // In the order they were chosen.
  const orders: SlipOrder[] = ids.map(id => rows.find(r => r.id === id)).filter((o): o is NonNullable<typeof o> => !!o).map(o => ({
    id: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt.toISOString(), phone: o.phone || '', email: o.email || '', userName: o.user?.name || '',
    shippingAddressJson: o.shippingAddressJson || '', shippingMethod: o.shippingMethod || '', isGift: o.isGift, giftMessage: o.giftMessage || '',
    items: o.items.map(i => ({ id: i.id, name: i.name, variant: i.variant?.name && i.variant.name !== 'Default Title' && !i.name.includes(i.variant.name) ? i.variant.name : '', quantity: i.quantity })),
  }))
  if (!orders.length) return <div className={ui.empty}>These orders were not found.</div>
  return <PackingSlips orders={orders} store={{ name: store.name, logoUrl: store.logoUrl, color: store.color, website: store.website, phone: store.phone, footer: store.footer }} timezone={timezone} />
}

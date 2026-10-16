import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreIdentity } from '@/lib/store-identity'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getThemeState } from '@/lib/theme'
import { parseDeliveryAreas } from '@/lib/storefront-market'
import { storeDayKey } from '@/lib/daily-summary'
import DeliverySheet from '@/components/delivery-sheet'

const ORDER_SELECT = {
  id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, currency: true,
  phone: true, email: true, shippingAddressJson: true, shippingMethod: true, createdAt: true,
  user: { select: { name: true } },
  items: { select: { name: true, quantity: true, variant: { select: { name: true } } } },
} as const

// Admin > Orders > Delivery sheet: today's run for the driver.
export default async function DeliverySheetPage() {
  const user = await requirePermission('orders.view')
  const [orders, timezone, store, themeState, deliveredEvents] = await Promise.all([
    db.order.findMany({ where: { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } }, select: ORDER_SELECT, orderBy: { createdAt: 'asc' }, take: 300 }),
    getStoreTimezone(),
    getStoreIdentity(),
    getThemeState().catch(() => null),
    db.orderEvent.findMany({ where: { status: 'DELIVERED', createdAt: { gte: new Date(Date.now() - 30 * 60 * 60 * 1000) } }, select: { orderId: true, createdAt: true } }),
  ])
  // Delivered today (store time): what the driver should have brought back.
  const today = storeDayKey(new Date(), timezone)
  const deliveredIds = [...new Set(deliveredEvents.filter(e => storeDayKey(e.createdAt, timezone) === today).map(e => e.orderId))]
  const delivered = deliveredIds.length
    ? await db.order.findMany({ where: { id: { in: deliveredIds }, status: 'DELIVERED' }, select: { id: true, orderNumber: true, paymentMethod: true, grandTotal: true, currency: true } })
    : []
  const areaOrder = parseDeliveryAreas((themeState?.theme as any)?.delivery?.areas).map(a => a.name)
  const dayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())
  return <DeliverySheet
    initial={JSON.parse(JSON.stringify(orders))}
    deliveredToday={JSON.parse(JSON.stringify(delivered))}
    areaOrder={areaOrder}
    dayLabel={dayLabel}
    storeName={store.name}
    storeCountry={store.country}
    canManage={hasPermission(user, 'orders.manage')}
  />
}

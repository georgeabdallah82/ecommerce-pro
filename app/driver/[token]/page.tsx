import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { driverForToken } from '@/lib/drivers'
import { getStoreIdentity } from '@/lib/store-identity'
import { getContactInfo } from '@/lib/store-contact'
import DriverRun from '@/components/driver-run'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'My deliveries', robots: { index: false, follow: false }, referrer: 'no-referrer' }

// A driver's own delivery list (Admin > Orders > Drivers gives each driver this link). No
// account: the long code in the link is the key, and the store can replace it at any time.
export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const driver = await driverForToken(token)
  if (!driver) {
    return <main style={{ maxWidth: 460, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 22 }}>This link no longer works</h1>
      <p style={{ color: '#555' }}>Ask the store to send you your new delivery link.</p>
    </main>
  }
  const since = new Date(Date.now() - 18 * 60 * 60 * 1000)
  const [orders, store, contact] = await Promise.all([
    db.order.findMany({
      where: {
        driverId: driver.id,
        OR: [
          { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } },
          { status: 'DELIVERED', cashCollected: { gt: 0 }, cashSettledAt: null },
          { status: 'DELIVERED', updatedAt: { gte: since } },
        ],
      },
      select: {
        id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, currency: true,
        phone: true, email: true, shippingAddressJson: true, cashCollected: true, cashSettledAt: true, updatedAt: true,
        items: { select: { name: true, quantity: true, variant: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    getStoreIdentity(),
    getContactInfo().catch(() => null),
  ])
  return <DriverRun
    token={token}
    driverName={driver.name}
    storeName={store.name}
    storeCountry={store.country}
    storePhone={contact?.phone || ''}
    initial={JSON.parse(JSON.stringify(orders))}
  />
}

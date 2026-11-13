import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { driverForToken } from '@/lib/drivers'
import { getStoreIdentity } from '@/lib/store-identity'
import { getContactInfo } from '@/lib/store-contact'
import DriverRun from '@/components/driver-run'
import { Link2Off } from 'lucide-react'
import { getT } from '@/lib/i18n-server'
// The order confirmation's card (app/order/success), like the store's other pages reached from a link it sends.
import s from '@/app/order/success/success.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'My deliveries', robots: { index: false, follow: false }, referrer: 'no-referrer' }

// A driver's own delivery list (Admin > Orders > Drivers gives each driver this link). No
// account: the long code in the link is the key, and the store can replace it at any time.
export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const driver = await driverForToken(token)
  if (!driver) {
    // In the store's language and font; it was English only, and in Arabic its full stop landed on the wrong side.
    const t = await getT()
    return <main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.hero}`}>
      <span className={`${s.tick} ${s.tickWarn}`} aria-hidden="true"><Link2Off size={32} /></span>
      <h1 className={s.title}>{t('This link no longer works')}</h1>
      <p className={s.lead}>{t('Ask the store to send you your new delivery link.')}</p>
    </section></div></main>
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

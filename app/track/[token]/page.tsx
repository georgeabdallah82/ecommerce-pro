import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/prisma'
import { StoreFooter } from '@/components/store-footer'
import DeliveryTrackingMap from '@/components/delivery-tracking-map'
import { getT } from '@/lib/i18n-server'
import { getCurrentUser } from '@/lib/auth'

export default async function DeliveryTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 32) notFound()

  const tracking = await db.deliveryTracking.findUnique({ where: { trackingToken: token } })
  if (!tracking) notFound()
  const order = await db.order.findUnique({ where: { id: tracking.orderId }, select: { status: true, fulfillmentStatus: true } })
  if (!order) notFound()

  const active = tracking.active && (order.status === 'PROCESSING' || order.status === 'SHIPPED')
  const initial = {
    active,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    etaMinutes: active ? tracking.etaMinutes : null,
    position: active && tracking.latitude !== null && tracking.longitude !== null
      ? { latitude: Math.round(tracking.latitude * 1000) / 1000, longitude: Math.round(tracking.longitude * 1000) / 1000 }
      : null,
    locationUpdatedAt: tracking.lastLocationUpdatedAt?.toISOString() || null,
    locationFresh: active && !!tracking.lastLocationUpdatedAt && Date.now() - tracking.lastLocationUpdatedAt.getTime() <= 120_000,
    pollingSeconds: 15,
  }

  const [t, user] = await Promise.all([getT(), getCurrentUser().catch(() => null)])
  // The link usually reaches a guest by WhatsApp: "Back to account" only led them to sign in.
  const back = user ? { href: '/account', label: t('Back to account') } : { href: '/shop', label: t('Continue shopping') }
  return <><main className="section"><div className="container" style={{maxWidth:960}}><Link className="textLink" href={back.href}>{back.label}</Link><div style={{marginTop:18}}><DeliveryTrackingMap token={token} initial={initial}/></div></div></main><StoreFooter /></>
}

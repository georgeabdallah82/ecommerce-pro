import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/prisma'
import { Footer } from '@/components/footer'
import DeliveryTrackingMap from '@/components/delivery-tracking-map'

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

  return <><main className="section"><div className="container" style={{maxWidth:960}}><Link className="textLink" href="/account">← Back to account</Link><div style={{marginTop:18}}><DeliveryTrackingMap token={token} initial={initial}/></div></div></main><Footer/></>
}

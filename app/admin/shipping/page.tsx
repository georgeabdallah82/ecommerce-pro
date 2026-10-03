import Link from 'next/link'
import { Truck } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { parseDeliveryAreas } from '@/lib/storefront-market'
import ShippingAdminPro from '@/components/shipping-admin-pro'
import ui from '@/components/admin-ui.module.css'

export default async function Shipping() {
  await requirePermission('shipping.view')
  const [initial, { theme }] = await Promise.all([
    db.shippingZone.findMany({ include: { rates: true }, orderBy: { name: 'asc' } }),
    getThemeState(),
  ])
  // The delivery times shoppers see (delivery bar, product pages) live in the theme; shown here
  // too because this is where merchants look for them.
  const delivery = (theme as any).delivery || {}
  const areas = parseDeliveryAreas(delivery.areas)
  const deliveryTimes = (
    <div className={ui.card} style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div><strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Truck size={16} /> Delivery times shown on your store</strong>
          <p className={ui.muted} style={{ margin: '4px 0 0', fontSize: 13 }}>{delivery.enabled === false ? 'The delivery bar is switched off.' : 'Shoppers pick their area under the header and see this time there and on every product page.'}</p></div>
        <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/online-store/theme-editor?settings=delivery">Edit areas &amp; times</Link>
      </div>
      {areas.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {areas.map(a => <span key={a.name} className={ui.statusPill} style={{ fontSize: 12, fontWeight: 650 }}>{a.name}{a.eta ? <span style={{ fontWeight: 500 }}>· {a.eta}</span> : null}</span>)}
      </div>}
    </div>
  )
  return <ShippingAdminPro initial={JSON.parse(JSON.stringify(initial))} deliveryTimes={deliveryTimes} />
}

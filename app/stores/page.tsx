import type { Metadata } from 'next'
import { StoreFooter } from '@/components/store-footer'
import { db } from '@/lib/prisma'
import { parseStores, telHref } from '@/lib/stores'
import { getT } from '@/lib/i18n-server'

export const metadata: Metadata = { title: 'Our stores' }
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Where shoppers can collect or visit, typed by the owner in Settings (lib/stores.ts).
export default async function Stores() {
  const [t, row] = await Promise.all([
    getT(),
    db.setting.findUnique({ where: { key: 'stores.list' }, select: { value: true } }).catch(() => null),
  ])
  const stores = parseStores(row?.value)
  return <>
    <main className="section">
      <div className="container" style={{ display: 'grid', gap: 18 }}>
        <div>
          <span className="muted">{t('STORES')}</span>
          <h1 className="h2">{t('Our stores')}</h1>
        </div>
        {stores.length ? <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {stores.map((store, i) => <article key={i} className="card" style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 17 }}>{store.name}</strong>
            {store.address ? <span>{store.address}</span> : null}
            {store.hours ? <span className="muted">{t('Opening hours')}: {store.hours}</span> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
              {telHref(store.phone) ? <a href={telHref(store.phone)} style={{ fontWeight: 700 }}>{t('Call')} {store.phone}</a> : null}
              {store.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{t('Directions')}</a> : null}
            </div>
          </article>)}
        </div> : <p className="muted">{t('We do not have a shop to visit yet. Order online and we deliver to you.')}</p>}
      </div>
    </main>
    <StoreFooter />
  </>
}

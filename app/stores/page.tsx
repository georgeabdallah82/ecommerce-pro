import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, MapPin, Navigation, Phone, Store, Truck } from 'lucide-react'
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
  // Each store is a card: its name, address and hours, then Call and Directions as real buttons (they were bold text
  // links). With no store yet, the page says so and leads to the shop (app/storefront-pages.css).
  return <>
    <main className="section storesPage">
      <div className="container">
        <div className="storesHead">
          <span className="muted">{t('STORES')}</span>
          <h1 className="h2">{t('Our stores')}</h1>
        </div>
        {stores.length ? <div className="storesGrid">
          {stores.map((store, i) => {
            const tel = telHref(store.phone)
            return <article key={i} className="storeCard">
              <span className="storeCardIcon" aria-hidden="true"><Store size={20} /></span>
              <h2 className="storeCardName">{store.name}</h2>
              {store.address ? <p className="storeCardLine"><MapPin size={16} aria-hidden="true" /><span>{store.address}</span></p> : null}
              {store.hours ? <p className="storeCardLine"><Clock size={16} aria-hidden="true" /><span>{t('Opening hours')}: {store.hours}</span></p> : null}
              {tel || store.address ? <div className="storeCardActions">
                {store.address ? <a className="storeCardBtn isPrimary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" />{t('Directions')}</a> : null}
                {tel ? <a className="storeCardBtn" href={tel}><Phone size={16} aria-hidden="true" />{t('Call')} <span dir="ltr">{store.phone}</span></a> : null}
              </div> : null}
            </article>
          })}
        </div> : <section className="storesEmpty" role="status">
          <span className="storesEmptyIcon" aria-hidden="true"><Truck size={26} /></span>
          <h2>{t('Delivered to your door')}</h2>
          <p>{t('We do not have a shop to visit yet. Order online and we deliver to you.')}</p>
          <Link className="focalButton primary" href="/shop">{t('Shop products')}</Link>
        </section>}
      </div>
    </main>
    <StoreFooter />
  </>
}

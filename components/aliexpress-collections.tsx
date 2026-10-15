'use client'

import Link from 'next/link'
import { StoreImage } from '@/components/storefront-sections'
import { useI18n } from '@/components/lang-provider'

type AnyMap = Record<string, any>

export default function AliExpressCollections({ collections }: { collections: AnyMap[] }) {
  const { t, count: plural } = useI18n()
  return (
    <main className="focalStorefront aliCollectionsPage">
      <div className="aliContainer">
        <header className="aliCollectionsHead">
          <span className="focalEyebrow">{t('CURATED SHOPPING')}</span>
          <h1>{t('Collections')}</h1>
          <p>{t('{n} to browse.', { n: collections.length })}</p>
        </header>

        {collections.length ? (
          <div className="aliCollectionGrid aliCollectionsGrid">
            {collections.map(c => {
              const count = c._count?.products ?? c.products?.length ?? 0
              return (
                <Link key={c.id} href={`/collections/${c.slug}`} className="focalCollectionCard aliCollectionCard">
                  <div className="focalCollectionMedia">
                    <StoreImage src={c.imageUrl || '/placeholder-product.svg'} alt={c.name || t('Collection')} />
                  </div>
                  <div className="focalCollectionCopy">
                    <span className="focalCollectionName">{c.name}</span>
                    <span className="aliCollectionCount">{plural(count, 'product')}</span>
                  </div>
                  {c.description && <p className="aliCollectionDesc">{c.description}</p>}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="aliEmptyState">{t('No collections yet.')}</p>
        )}
      </div>
    </main>
  )
}

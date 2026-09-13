'use client'

import Link from 'next/link'
import { StoreImage } from '@/components/storefront-sections'

type AnyMap = Record<string, any>

export default function AliExpressCollections({ collections }: { collections: AnyMap[] }) {
  return (
    <main className="focalStorefront aliCollectionsPage">
      <div className="aliContainer">
        <header className="aliCollectionsHead">
          <span className="focalEyebrow">CURATED SHOPPING</span>
          <h1>Collections</h1>
          <p>{collections.length} collection{collections.length === 1 ? '' : 's'} to browse.</p>
        </header>

        {collections.length ? (
          <div className="aliCollectionGrid aliCollectionsGrid">
            {collections.map(c => {
              const count = c._count?.products ?? c.products?.length ?? 0
              return (
                <Link key={c.id} href={`/collections/${c.slug}`} className="focalCollectionCard aliCollectionCard">
                  <div className="focalCollectionMedia">
                    <StoreImage src={c.imageUrl || '/placeholder-product.svg'} alt={c.name || 'Collection'} />
                  </div>
                  <div className="focalCollectionCopy">
                    <span className="focalCollectionName">{c.name}</span>
                    <span className="aliCollectionCount">{count} item{count === 1 ? '' : 's'}</span>
                  </div>
                  {c.description && <p className="aliCollectionDesc">{c.description}</p>}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="aliEmptyState">No collections yet.</p>
        )}
      </div>
    </main>
  )
}

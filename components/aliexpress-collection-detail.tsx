'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import StorefrontSections, { ProductCard, QuickView, StoreImage } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'

type AnyMap = Record<string, any>

export default function AliExpressCollectionDetail({ theme, collection, products, sections = [], zoneCollections = [] }: { theme: AnyMap; collection: AnyMap; products: AnyMap[]; sections?: AnyMap[]; zoneCollections?: AnyMap[] }) {
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  const [sort, setSort] = useState('curated')
  const cp = theme.collectionPage || {}
  const showBreadcrumbs = cp.showBreadcrumbs !== false
  const showDescription = cp.showDescription !== false
  const showImage = cp.showImage !== false
  const showSort = cp.showSort !== false

  const sorted = useMemo(() => {
    if (sort === 'price_asc') return [...products].sort((a, b) => Number(a.basePrice || 0) - Number(b.basePrice || 0))
    if (sort === 'price_desc') return [...products].sort((a, b) => Number(b.basePrice || 0) - Number(a.basePrice || 0))
    if (sort === 'bestselling') return [...products].sort((a, b) => Number(b.soldCount || 0) - Number(a.soldCount || 0))
    if (sort === 'rating') return [...products].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    return products
  }, [products, sort])

  return (
    <main className="focalStorefront aliCollectionPage">
      {showBreadcrumbs && (
        <div className="aliContainer aliBreadcrumbs">
          <Link href="/">Home</Link><ChevronRight size={12} />
          <Link href="/collections">Collections</Link><ChevronRight size={12} />
          <span>{collection.name}</span>
        </div>
      )}
      {showImage ? (
        <div className="aliCollectionBanner">
          <StoreImage src={collection.imageUrl || '/placeholder-product.svg'} alt={collection.name} eager />
          <div className="aliCollectionBannerOverlay">
            <div className="aliContainer">
              <span className="focalEyebrow">COLLECTION</span>
              <h1>{collection.name}</h1>
              {showDescription && collection.description && <p>{collection.description}</p>}
              <span className="aliCollectionCount">{products.length} product{products.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      ) : (
        <header className="aliContainer aliCollectionsHead">
          <span className="focalEyebrow">COLLECTION</span>
          <h1>{collection.name}</h1>
          {showDescription && collection.description && <p>{collection.description}</p>}
          <span className="aliCollectionCount">{products.length} product{products.length === 1 ? '' : 's'}</span>
        </header>
      )}

      <div className="aliContainer">
        <div className="aliCollectionToolbar">
          <span className="focalResultCount">{products.length} product{products.length === 1 ? '' : 's'}</span>
          {showSort && (
            <select value={sort} onChange={e => setSort(e.target.value)}>
              <option value="curated">Featured</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="bestselling">Best Selling</option>
              <option value="rating">Rating</option>
            </select>
          )}
        </div>

        {sorted.length ? (
          <div className="aliDenseGrid">
            {sorted.map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        ) : (
          <p className="aliEmptyState">No products in this collection yet.</p>
        )}
      </div>

      {/* Merchant-addable content appended below the fixed collection layout
          above -- see the matching comment in components/aliexpress-product.tsx
          for the pattern this follows. Shared with /shop (components/
          aliexpress-shop.tsx), same as their settings already are under the
          Theme tab's "Collection & shop pages" category. */}
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={products} collections={zoneCollections} />}

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </main>
  )
}

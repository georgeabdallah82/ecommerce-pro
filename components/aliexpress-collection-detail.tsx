'use client'

import { useMemo, useState } from 'react'
import { ProductCard, QuickView, StoreImage } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'

type AnyMap = Record<string, any>

export default function AliExpressCollectionDetail({ theme, collection, products }: { theme: AnyMap; collection: AnyMap; products: AnyMap[] }) {
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  const [sort, setSort] = useState('curated')

  const sorted = useMemo(() => {
    if (sort === 'price_asc') return [...products].sort((a, b) => Number(a.basePrice || 0) - Number(b.basePrice || 0))
    if (sort === 'price_desc') return [...products].sort((a, b) => Number(b.basePrice || 0) - Number(a.basePrice || 0))
    if (sort === 'bestselling') return [...products].sort((a, b) => Number(b.soldCount || 0) - Number(a.soldCount || 0))
    if (sort === 'rating') return [...products].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    return products
  }, [products, sort])

  return (
    <main className="focalStorefront aliCollectionPage">
      <div className="aliCollectionBanner">
        <StoreImage src={collection.imageUrl || '/placeholder-product.svg'} alt={collection.name} eager />
        <div className="aliCollectionBannerOverlay">
          <div className="aliContainer">
            <span className="focalEyebrow">COLLECTION</span>
            <h1>{collection.name}</h1>
            {collection.description && <p>{collection.description}</p>}
            <span className="aliCollectionCount">{products.length} product{products.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      <div className="aliContainer">
        <div className="aliCollectionToolbar">
          <span className="focalResultCount">{products.length} product{products.length === 1 ? '' : 's'}</span>
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="curated">Featured</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="bestselling">Best Selling</option>
            <option value="rating">Rating</option>
          </select>
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

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </main>
  )
}

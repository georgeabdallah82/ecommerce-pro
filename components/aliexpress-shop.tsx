'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import StorefrontSections, { ProductCard, QuickView } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'

type AnyMap = Record<string, any>

export default function AliExpressShop({ theme, products, collections, query, sections = [] }: { theme: AnyMap; products: AnyMap[]; collections: AnyMap[]; query: { q?: string; collection?: string; min?: string; max?: string; sort?: string }; sections?: AnyMap[] }) {
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  const sort = query.sort || 'newest'
  const cp = theme.collectionPage || {}
  const showFilters = cp.showFilters !== false
  const showSort = cp.showSort !== false

  const sorted = useMemo(() => {
    if (sort === 'bestselling') return [...products].sort((a, b) => Number(b.soldCount || 0) - Number(a.soldCount || 0))
    if (sort === 'rating') return [...products].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    return products
  }, [products, sort])

  return (
    <div className="focalStorefront aliShopPage">
      <div className={`aliContainer aliShopLayout ${showFilters ? '' : 'noSidebar'}`}>
        {showFilters && (
          <aside className="aliShopSidebar">
            <div>
              <h3>Collections</h3>
              <ul className="aliCategoryList">
                <li><Link href="/shop" className={!query.collection ? 'active' : ''}>All collections</Link></li>
                {collections.map(c => (
                  <li key={c.id}><Link href={`/shop?collection=${c.slug}`} className={query.collection === c.slug ? 'active' : ''}>{c.name}</Link></li>
                ))}
              </ul>
            </div>
            <form method="GET" className="aliPriceFilter">
              {query.collection && <input type="hidden" name="collection" value={query.collection} />}
              {query.q && <input type="hidden" name="q" value={query.q} />}
              {query.sort && <input type="hidden" name="sort" value={query.sort} />}
              <h3>Price</h3>
              <div className="aliPriceInputs">
                <input type="number" name="min" placeholder="Min" defaultValue={query.min} min={0} />
                <span>-</span>
                <input type="number" name="max" placeholder="Max" defaultValue={query.max} min={0} />
              </div>
              <button type="submit" className="focalButton primary aliPriceApply">Apply</button>
            </form>
          </aside>
        )}

        <main className="aliShopMain">
          <form method="GET" className="aliShopToolbar">
            {query.collection && <input type="hidden" name="collection" value={query.collection} />}
            {query.min && <input type="hidden" name="min" value={query.min} />}
            {query.max && <input type="hidden" name="max" value={query.max} />}
            <div className="aliShopSearch">
              <Search size={16} />
              <input type="text" name="q" placeholder="Search products…" defaultValue={query.q} />
            </div>
            {showSort && (
              <select name="sort" defaultValue={sort} onChange={e => e.currentTarget.form?.submit()}>
                <option value="newest">Newest</option>
                <option value="bestselling">Best Selling</option>
                <option value="rating">Top Rated</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            )}
            <button type="submit" className="focalButton primary">Search</button>
          </form>

          <p className="aliResultCount">{sorted.length} product{sorted.length === 1 ? '' : 's'}</p>

          {sorted.length > 0 ? (
            <div className="aliDenseGrid aliShopGrid">
              {sorted.map(p => (
                <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
              ))}
            </div>
          ) : (
            <div className="aliEmptyState">No products match your filters.</div>
          )}
        </main>
      </div>

      {/* Merchant-addable content appended below the fixed shop layout above --
          see the matching comment in components/aliexpress-product.tsx for
          the pattern this follows. Shared with /collections/[slug]
          (components/aliexpress-collection-detail.tsx), same as their
          settings already are under the Theme tab's "Collection & shop
          pages" category. Reuses this page's own already-fetched
          products/collections, so a product_grid or collection_grid section
          added here needs no extra data fetching of its own. */}
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={products} collections={collections} />}

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </div>
  )
}

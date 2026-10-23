'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import StorefrontSections, { ProductCard, QuickView } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'
import { SearchTracker } from '@/components/search-tracker'

type AnyMap = Record<string, any>

export default function AliExpressShop({ theme, products, collections, query, sections = [], pagination }: { theme: AnyMap; products: AnyMap[]; collections: AnyMap[]; query: { q?: string; collection?: string; min?: string; max?: string; sort?: string; page?: string }; sections?: AnyMap[]; pagination?: { page: number; pages: number; total: number } }) {
  const { t, count: plural } = useI18n()
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)
  // On phones the price filter folds away behind a button so products show on the first screen;
  // an active price shows as a chip above the results, so the panel stays closed until asked for.
  const priceActive = Boolean(query.min || query.max)
  const [priceOpen, setPriceOpen] = useState(false)
  const sort = query.sort || 'newest'
  const cp = theme.collectionPage || {}
  const showFilters = cp.showFilters !== false
  const showSort = cp.showSort !== false

  // Sorted (and paginated) on the server across the whole catalog.
  const sorted = products
  const total = pagination?.total ?? products.length
  const pageHref = (n: number) => {
    const params = new URLSearchParams(Object.entries(query).filter(([k, v]) => k !== 'page' && v) as [string, string][])
    if (n > 1) params.set('page', String(n))
    const qs = params.toString()
    return qs ? `/shop?${qs}` : '/shop'
  }

  // What is narrowing the list right now, each with a link that drops just that one.
  const without = (...keys: string[]) => {
    const params = new URLSearchParams(Object.entries(query).filter(([k, v]) => v && k !== 'page' && !keys.includes(k)) as [string, string][])
    const qs = params.toString()
    return qs ? `/shop?${qs}` : '/shop'
  }
  const activeCollection = collections.find(c => c.slug === query.collection)
  const activeFilters = [
    query.q ? { label: t('Search: {query}', { query: query.q }), href: without('q') } : null,
    activeCollection ? { label: activeCollection.name, href: without('collection') } : null,
    priceActive ? { label: t('Price: {min} to {max}', { min: query.min || '0', max: query.max || t('any') }), href: without('min', 'max') } : null,
  ].filter(Boolean) as { label: string; href: string }[]

  return (
    <div className="focalStorefront aliShopPage">
      {query.q ? <SearchTracker query={query.q} /> : null}
      <h1 className="srOnly">{query.q ? t('Search results for {query}', { query: query.q }) : collections.find(c => c.slug === query.collection)?.name || t('Shop all products')}</h1>
      <div className={`aliContainer aliShopLayout ${showFilters ? '' : 'noSidebar'}`}>
        {showFilters && (
          <aside className="aliShopSidebar">
            <div className="aliShopCollections">
              <h3>{t('Collections')}</h3>
              <ul className="aliCategoryList">
                <li><Link href="/shop" className={!query.collection ? 'active' : ''}>{t('All collections')}</Link></li>
                {collections.map(c => (
                  <li key={c.id}><Link href={`/shop?collection=${c.slug}`} className={query.collection === c.slug ? 'active' : ''}>{c.name}</Link></li>
                ))}
              </ul>
            </div>
            <button type="button" className={`aliFilterToggle ${priceActive ? 'active' : ''}`} aria-expanded={priceOpen} aria-controls="shop-price-filter" onClick={() => setPriceOpen(open => !open)}>
              <SlidersHorizontal size={15} /> {priceActive ? t('Price: {min} to {max}', { min: query.min || '0', max: query.max || t('any') }) : t('Filter by price')}
            </button>
            <form method="GET" id="shop-price-filter" className={`aliPriceFilter ${priceOpen ? 'open' : ''}`}>
              {query.collection && <input type="hidden" name="collection" value={query.collection} />}
              {query.q && <input type="hidden" name="q" value={query.q} />}
              {query.sort && <input type="hidden" name="sort" value={query.sort} />}
              <h3>{t('Price')}</h3>
              <div className="aliPriceInputs">
                <input type="number" name="min" aria-label={t('Minimum price')} placeholder={t('Min')} defaultValue={query.min} min={0} />
                <span>-</span>
                <input type="number" name="max" aria-label={t('Maximum price')} placeholder={t('Max')} defaultValue={query.max} min={0} />
              </div>
              <button type="submit" className="focalButton primary aliPriceApply">{t('Apply')}</button>
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
              <input type="text" name="q" aria-label={t('Search products')} placeholder={t('Search products…')} defaultValue={query.q} />
            </div>
            {showSort && (
              <select name="sort" aria-label={t('Sort products')} defaultValue={sort} onChange={e => e.currentTarget.form?.submit()}>
                <option value="newest">{t('Newest')}</option>
                <option value="bestselling">{t('Best Selling')}</option>
                <option value="rating">{t('Top Rated')}</option>
                <option value="price_asc">{t('Price: low to high')}</option>
                <option value="price_desc">{t('Price: high to low')}</option>
              </select>
            )}
            <button type="submit" className="focalButton primary">{t('Search')}</button>
          </form>

          {activeFilters.length > 0 && (
            <div className="shopActiveFilters">
              {activeFilters.map(f => <Link key={f.href} href={f.href} className="shopFilterChip" aria-label={t('Remove filter: {name}', { name: f.label })}>{f.label} <X size={14} aria-hidden="true" /></Link>)}
              {activeFilters.length > 1 && <Link href="/shop" className="shopFilterClear">{t('Clear all')}</Link>}
            </div>
          )}
          <p className="aliResultCount">{plural(total, 'product')}</p>

          {sorted.length > 0 ? (
            <div className="aliDenseGrid aliShopGrid">
              {sorted.map(p => (
                <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
              ))}
            </div>
          ) : (
            // No result: say what was searched and offer the way out (a shorter word, or everything).
            <div className="aliEmptyState shopEmpty">
              <Search size={28} aria-hidden="true" />
              <strong>{query.q ? t('No results for "{query}"', { query: query.q }) : t('No products match your filters.')}</strong>
              <p>{query.q ? t('Check the spelling or try a shorter word.') : t('Try another collection or price range.')}</p>
              <Link className="focalButton primary" href="/shop">{t('See all products')}</Link>
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <nav aria-label={t('Pages')} style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', margin: '28px 0 8px', flexWrap: 'wrap' }}>
              {pagination.page > 1 && <Link className="focalButton secondary" href={pageHref(pagination.page - 1)} rel="prev">{t('Previous')}</Link>}
              <span style={{ fontSize: 14 }}>{t('Page {page} of {pages}', { page: pagination.page, pages: pagination.pages })}</span>
              {pagination.page < pagination.pages && <Link className="focalButton secondary" href={pageHref(pagination.page + 1)} rel="next">{t('Next')}</Link>}
            </nav>
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

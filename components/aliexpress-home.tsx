'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ProductCard, CollectionCard, QuickView, StoreImage } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'

type AnyMap = Record<string, any>

export default function AliExpressHome({ theme, products, collections, categories }: { theme: AnyMap; products: AnyMap[]; collections: AnyMap[]; categories: AnyMap[] }) {
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)

  const discounted = useMemo(() => products.filter(p => Number(p.compareAtPrice || 0) > Number(p.basePrice || 0))
    .sort((a, b) => (Number(b.compareAtPrice) - Number(b.basePrice)) / Number(b.compareAtPrice) - (Number(a.compareAtPrice) - Number(a.basePrice)) / Number(a.compareAtPrice)), [products])
  const newArrivals = useMemo(() => [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [products])
  const bestSellers = useMemo(() => [...products].sort((a, b) => Number(b.soldCount || 0) - Number(a.soldCount || 0)), [products])

  // The countdown target/remaining time must not be computed during the
  // render that gets server-rendered -- Date.now() differs by however
  // long the response takes to reach the client, which mismatches the
  // server HTML against the client's first render. Start at 0 (matches
  // on both sides) and only compute real values client-side, after mount.
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    const next = new Date()
    next.setHours(24, 0, 0, 0)
    const target = next.getTime()
    setRemaining(Math.max(0, target - Date.now()))
    const id = setInterval(() => setRemaining(Math.max(0, target - Date.now())), 1000)
    return () => clearInterval(id)
  }, [])
  const totalSec = Math.floor(remaining / 1000)
  const hh = Math.floor(totalSec / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60

  return (
    <div className="focalStorefront aliHome">
      {categories.length > 0 && (
        <section className="aliCategoryStrip">
          <div className="aliContainer aliCategoryRow">
            {categories.map(c => (
              <Link key={c.id} href={`/shop?category=${c.slug}`} className="aliCategoryItem">
                <span className="aliCategoryIcon"><StoreImage src={c.imageUrl || '/placeholder-product.svg'} alt={c.name} /></span>
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {discounted.length > 0 && (
        <section className="aliFlash">
          <div className="aliContainer aliFlashHead">
            <div className="aliFlashTitle">
              <span className="aliFlashBolt">⚡</span>
              <h2>Flash Deals</h2>
            </div>
            <div className="aliFlashTimer">
              <span>Ends in</span>
              <strong>{String(hh).padStart(2, '0')}</strong>:
              <strong>{String(mm).padStart(2, '0')}</strong>:
              <strong>{String(ss).padStart(2, '0')}</strong>
            </div>
            <Link href="/shop" className="aliViewAll">View all <ChevronRight size={15} /></Link>
          </div>
          <div className="aliContainer aliFlashGrid">
            {discounted.slice(0, 12).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </section>
      )}

      {collections.length > 0 && (
        <section className="aliSection">
          <div className="aliContainer aliSectionHead"><h2>Shop by collection</h2><Link href="/collections" className="aliViewAll">All collections <ChevronRight size={15} /></Link></div>
          <div className="aliContainer aliCollectionGrid">
            {collections.slice(0, 8).map(c => <CollectionCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {newArrivals.length > 0 && (
        <section className="aliSection">
          <div className="aliContainer aliSectionHead"><h2>New Arrivals</h2><Link href="/shop?sort=newest" className="aliViewAll">View all <ChevronRight size={15} /></Link></div>
          <div className="aliContainer aliDenseGrid">
            {newArrivals.slice(0, 12).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </section>
      )}

      {bestSellers.some(p => Number(p.soldCount || 0) > 0) && (
        <section className="aliSection">
          <div className="aliContainer aliSectionHead"><h2>Best Sellers</h2><Link href="/shop" className="aliViewAll">View all <ChevronRight size={15} /></Link></div>
          <div className="aliContainer aliDenseGrid">
            {bestSellers.filter(p => Number(p.soldCount || 0) > 0).slice(0, 12).map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </section>
      )}

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ProductCard, QuickView } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'

type AnyMap = Record<string, any>

export default function WishlistGrid({ theme, products }: { theme: AnyMap; products: AnyMap[] }) {
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)

  return (
    <main className="focalStorefront aliShopPage">
      <div className="aliContainer">
        <span className="focalEyebrow">SAVED</span>
        <h1 style={{ margin: '8px 0 20px' }}>Wishlist</h1>

        {products.length ? (
          <div className="aliDenseGrid">
            {products.map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        ) : (
          <p className="aliEmptyState">You haven't saved anything yet. <Link href="/shop">Browse the shop</Link></p>
        )}
      </div>

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </main>
  )
}

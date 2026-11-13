'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { ProductCard, QuickView } from '@/components/storefront-sections'
import { useWishlist } from '@/components/use-wishlist'
import { useI18n } from '@/components/lang-provider'

type AnyMap = Record<string, any>

export default function WishlistGrid({ theme, products }: { theme: AnyMap; products: AnyMap[] }) {
  const { t } = useI18n()
  const { wishlist, toggleWish } = useWishlist()
  const [quickProduct, setQuickProduct] = useState<AnyMap | null>(null)

  return (
    <main className="focalStorefront aliShopPage wishlistPage">
      <div className="aliContainer">
        <span className="focalEyebrow">{t('SAVED')}</span>
        <h1 style={{ margin: '8px 0 20px' }}>{t('Wishlist')}</h1>

        {products.length ? (<>
          {/* The product names are h3: this is the level between them and the page's h1, for screen readers. */}
          <h2 className="srOnly">{t('Products')}</h2>
          <div className="aliDenseGrid">
            {products.map(p => (
              <ProductCard key={p.id} p={p} theme={theme} onQuickView={setQuickProduct} wishlist={wishlist} toggleWish={toggleWish} />
            ))}
          </div>
        </>) : (
          // Empty: the same card as the empty cart, saying how to save something, with the way to the shop.
          <section className="wishEmpty" role="status">
            <span className="wishEmptyIcon" aria-hidden="true"><Heart size={26} /></span>
            <h2>{t("You haven't saved anything yet.")}</h2>
            <p>{t('Tap the heart on any product to keep it here for later.')}</p>
            <Link className="focalButton primary" href="/shop">{t('Browse the shop')}</Link>
          </section>
        )}
      </div>

      {quickProduct && <QuickView product={quickProduct} theme={theme} onClose={() => setQuickProduct(null)} />}
    </main>
  )
}

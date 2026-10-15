'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'
import { Plus } from 'lucide-react'
import { useCart } from '@/components/cart-provider'
import { StoreImage, img, money } from '@/components/storefront-sections'
import type { Suggestion } from '@/lib/recommendations'
import styles from './cart-suggestions.module.css'

// "Goes well with your cart" at the bottom of the cart drawer: products often bought with what's
// in the cart (lib/recommendations.ts via /api/store/recommendations), one tap to add.
export default function CartSuggestions({ currency = 'USD', onNavigate }: { currency?: string; onNavigate?: () => void }) {
  const { items, addItem } = useCart()
  const { t } = useI18n()
  const ids = useMemo(() => [...new Set(items.map(item => item.productId))].sort().join(','), [items])
  const [products, setProducts] = useState<Suggestion[]>([])

  useEffect(() => {
    if (!ids) { setProducts([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/store/recommendations?ids=${encodeURIComponent(ids)}&limit=6`, { signal: controller.signal })
        .then(response => (response.ok ? response.json() : { products: [] }))
        .then(data => setProducts(Array.isArray(data.products) ? data.products : []))
        .catch(() => undefined)
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [ids])

  if (!products.length) return null
  return (
    <section className={styles.box} aria-labelledby="cart-suggestions-title">
      <h3 id="cart-suggestions-title">{t('Goes well with your cart')}</h3>
      <div className={styles.track}>
        {products.map(product => {
          const option = product.options[0]
          const choose = product.options.length > 1
          return (
            <div key={product.id} className={styles.card}>
              <Link href={`/product/${product.slug}`} className={styles.picture} onClick={onNavigate}><StoreImage src={product.image} alt={product.name} /></Link>
              <Link href={`/product/${product.slug}`} className={styles.name} onClick={onNavigate}>{product.name}</Link>
              <span className={styles.price}>{money(option?.price ?? product.price, currency)}</span>
              {choose ? (
                <Link href={`/product/${product.slug}`} className={styles.add} onClick={onNavigate}>{t('Choose')}</Link>
              ) : (
                <button type="button" className={styles.add} aria-label={t('Add {name} to cart', { name: product.name })} onClick={() => addItem({
                  productId: product.id,
                  variantId: option?.id || null,
                  name: product.name,
                  sku: option?.sku || product.sku,
                  price: option?.price ?? product.price,
                  image: product.image ? img(product.image) : undefined,
                  quantity: 1,
                }, false)}><Plus size={14} /> {t('Add')}</button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

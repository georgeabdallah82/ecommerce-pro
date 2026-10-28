'use client'
import { useState } from 'react'
import { useCart, type CartItem } from '@/components/cart-provider'
import { useI18n } from '@/components/lang-provider'
import { money } from '@/components/storefront-sections'

// "Buy again" on the account page: the products from the latest orders, at today's price, with one
// tap to put one in the cart.
export default function BuyAgain({ items, currency }: { items: CartItem[]; currency: string }) {
  const { addItem } = useCart()
  const { t } = useI18n()
  const [added, setAdded] = useState<string | null>(null)
  if (!items.length) return null
  return (
    <section className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="sectionHead small"><h3>{t('Buy again')}</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>{t("Products you bought before, at today's price.")}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {items.map(item => {
          const key = `${item.productId}|${item.variantId ?? ''}`
          return (
            <li key={key} style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
              {item.image ? <img src={item.image} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#fff', borderRadius: 10 }} /> : null}
              <strong style={{ fontSize: 14, lineHeight: 1.3 }}>{item.name}</strong>
              <span>{money(item.price, currency)}</span>
              <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => { addItem(item, false, false); setAdded(key) }}>{added === key ? t('Added') : t('Add to cart')}</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

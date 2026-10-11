'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Plus, ShoppingBag } from 'lucide-react'
import { useCart, type CartItem } from '@/components/cart-provider'
import { StoreImage, img, money } from '@/components/storefront-sections'
import type { Suggestion } from '@/lib/recommendations'
import styles from './bought-together.module.css'

// "Frequently bought together" under the product (suggestions from lib/recommendations.ts): this
// product plus one or two others, each ticked, with the total and one button that adds them all.
export default function BoughtTogether({ main, items, currency }: { main: CartItem; items: Suggestion[]; currency: string }) {
  const { addItem } = useCart()
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map(item => [item.id, true])))
  const [option, setOption] = useState<Record<string, string>>(() => Object.fromEntries(items.filter(i => i.options.length).map(i => [i.id, i.options[0].id])))
  const [added, setAdded] = useState(false)

  const lines = useMemo(() => items.map(item => {
    const chosen = item.options.find(o => o.id === option[item.id]) || item.options[0]
    const line: CartItem = {
      productId: item.id,
      variantId: chosen?.id || null,
      name: chosen && item.options.length > 1 ? `${item.name} — ${chosen.name}` : item.name,
      sku: chosen?.sku || item.sku,
      price: chosen?.price ?? item.price,
      image: item.image ? img(item.image) : undefined,
      quantity: 1,
    }
    return { item, line }
  }), [items, option])

  const chosenLines = lines.filter(({ item }) => ticked[item.id])
  const total = main.price + chosenLines.reduce((sum, { line }) => sum + line.price, 0)
  const count = 1 + chosenLines.length

  function addAll() {
    const all = [main, ...chosenLines.map(({ line }) => line)]
    all.forEach((line, i) => addItem(line, i === all.length - 1))
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  return (
    <section className={styles.box} aria-labelledby="bought-together-title">
      <h2 id="bought-together-title">Frequently bought together</h2>
      <div className={styles.pictures} aria-hidden="true">
        <span className={styles.picture}><StoreImage src={main.image} alt="" /></span>
        {lines.map(({ item }) => (
          <span key={item.id} className={styles.pictureGroup}>
            <Plus size={16} className={styles.plus} />
            <Link href={`/product/${item.slug}`} className={`${styles.picture} ${ticked[item.id] ? '' : styles.off}`} tabIndex={-1}><StoreImage src={item.image} alt="" /></Link>
          </span>
        ))}
      </div>

      <ul className={styles.list}>
        <li className={styles.row}>
          <span className={`${styles.tick} ${styles.locked}`} aria-hidden="true"><Check size={14} /></span>
          <span className={styles.name}><strong>This item:</strong> {main.name}</span>
          <span className={styles.price}>{money(main.price, currency)}</span>
        </li>
        {lines.map(({ item, line }) => (
          <li key={item.id} className={`${styles.row} ${ticked[item.id] ? '' : styles.unticked}`}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={!!ticked[item.id]} onChange={e => setTicked(cur => ({ ...cur, [item.id]: e.target.checked }))} />
              <span className={styles.tick} aria-hidden="true"><Check size={14} /></span>
              <span className={styles.srOnly}>Add {item.name}</span>
            </label>
            <span className={styles.name}>
              <Link href={`/product/${item.slug}`}>{item.name}</Link>
              {item.options.length > 1 && (
                <select className={styles.select} value={option[item.id]} onChange={e => setOption(cur => ({ ...cur, [item.id]: e.target.value }))} aria-label={`Option for ${item.name}`}>
                  {item.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </span>
            <span className={styles.price}>{money(line.price, currency)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.foot}>
        <div className={styles.total}><span>Total for {count}</span><strong>{money(total, currency)}</strong></div>
        <button type="button" className={styles.add} onClick={addAll}>
          {added ? <>Added <Check size={16} /></> : <><ShoppingBag size={16} /> {count === 1 ? 'Add to cart' : `Add all ${count} to cart`}</>}
        </button>
      </div>
    </section>
  )
}

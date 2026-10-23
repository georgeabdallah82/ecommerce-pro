'use client'

import { useEffect, useState } from 'react'
import { Check, ShoppingBag } from 'lucide-react'

// Phones only: whenever the product page's own Buy buttons are not on screen -- below the first screen
// when a shopper lands from an ad, or above it after scrolling to the description and reviews -- a slim bar
// with the price and "Add to cart" stays at the bottom. It never shows while the real buttons are visible.
export default function StickyBuyBar({ watch, price, compareAt, addLabel, addedLabel, added, disabled, onAdd }: {
  watch: string
  price: string
  compareAt?: string
  addLabel: string
  addedLabel: string
  added: boolean
  disabled: boolean
  onAdd: () => void
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const target = document.querySelector(watch)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [watch])

  // The floating WhatsApp button and the page bottom make room for the bar while it shows.
  useEffect(() => {
    document.body.classList.toggle('hasStickyBuy', show)
    return () => document.body.classList.remove('hasStickyBuy')
  }, [show])

  if (!show) return null
  return <div className="stickyBuy" role="region" aria-label={addLabel}>
    <div className="stickyBuyPrice"><strong>{price}</strong>{compareAt ? <del>{compareAt}</del> : null}</div>
    <button type="button" className={`focalButton primary stickyBuyBtn${added ? ' addedSuccess' : ''}`} onClick={onAdd} disabled={disabled}>
      {added ? <>{addedLabel} <Check size={16} /></> : <>{addLabel} <ShoppingBag size={16} /></>}
    </button>
  </div>
}

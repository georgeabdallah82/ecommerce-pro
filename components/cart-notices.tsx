'use client'
import { useCart } from '@/components/cart-provider'

// Tells the shopper what changed when their saved cart was checked against the store.
export function CartNotices() {
  const { notices, dismissNotices } = useCart()
  if (!notices.length) return null
  return (
    <div role="status" style={{ border: '1px solid var(--store-border, #eaded4)', background: 'var(--store-secondary, #fff0e8)', borderRadius: 12, padding: '12px 14px', margin: '0 0 16px', fontSize: 14, display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <strong style={{ display: 'block', marginBottom: 4 }}>Your cart was updated</strong>
        {notices.map(text => <div key={text}>{text}</div>)}
      </div>
      <button type="button" onClick={dismissNotices} aria-label="Dismiss" style={{ border: 0, background: 'transparent', fontSize: 18, lineHeight: 1, cursor: 'pointer', color: 'inherit' }}>×</button>
    </div>
  )
}

'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { money } from '@/lib/config'
import { addToTill, findByCode, searchItems, setQuantity, tillTotals, type TillItem, type TillLine } from '@/lib/pos-till'

const button = { minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #d6d6cf', background: '#fff', cursor: 'pointer', font: 'inherit' } as const

/**
 * The till's first screen. A scanner types a barcode and presses Enter, which adds the item.
 * Nothing is saved yet: taking payment, saving the sale and printing a receipt come in the next step.
 */
export default function PosTill({ items }: { items: TillItem[] }) {
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<TillLine[]>([])
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchItems(items, query), [items, query])
  const totals = tillTotals(lines)

  function add(item: TillItem) {
    const before = lines.find(line => line.key === item.key)?.quantity ?? 0
    const next = addToTill(lines, item)
    const after = next.find(line => line.key === item.key)?.quantity ?? 0
    setMessage(after === before ? (item.available <= 0 ? `${item.title} is out of stock` : `Only ${item.available} of ${item.title} in stock`) : '')
    setLines(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const exact = findByCode(items, query)
    if (exact) {
      add(exact)
      setQuery('')
    } else if (query.trim() && results.length === 0) {
      setMessage('Nothing matches that barcode, SKU or name')
    }
    inputRef.current?.focus()
  }

  function change(key: string, quantity: number) {
    setLines(setQuantity(lines, key, quantity))
    setMessage('')
  }

  return (
    <section style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Point of sale</h1>
        <p style={{ color: '#5f6673', margin: 0, lineHeight: 1.5 }}>
          Scan a barcode or type a name or SKU. Sales are not saved yet: payment, saving and receipts come next.
        </p>
      </header>

      <form onSubmit={submit} role="search" style={{ display: 'grid', gap: 8 }}>
        <input
          ref={inputRef}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={event => { setQuery(event.target.value); setMessage('') }}
          placeholder="Barcode, SKU or product name"
          aria-label="Barcode, SKU or product name"
          style={{ minHeight: 52, padding: '0 14px', fontSize: 18, borderRadius: 12, border: '1px solid #cfcfc8', font: 'inherit' }}
        />
      </form>

      <p role="status" style={{ minHeight: 20, margin: 0, color: '#9a5b0f' }}>{message}</p>

      {query.trim() && results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {results.map(item => (
            <li key={item.key}>
              <button type="button" onClick={() => add(item)} disabled={item.available <= 0} style={{ ...button, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', opacity: item.available <= 0 ? 0.5 : 1 }}>
                <span>
                  <strong style={{ fontWeight: 600 }}>{item.title}</strong>
                  <span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{item.sku}{item.barcode ? ` · ${item.barcode}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {money(item.unitPrice)}
                  <span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{item.available > 0 ? `${item.available} in stock` : 'Out of stock'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Cart</h2>
          {lines.length > 0 && <button type="button" onClick={() => { setLines([]); setMessage('') }} style={button}>Clear</button>}
        </div>

        {lines.length === 0 ? (
          <p style={{ color: '#5f6673', margin: '8px 0' }}>No items yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {lines.map(line => (
              <li key={line.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid #f0f0ec', paddingTop: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{line.title}</strong>
                  <span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{money(line.unitPrice)} each</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" aria-label={`Remove one ${line.title}`} onClick={() => change(line.key, line.quantity - 1)} style={button}>−</button>
                  <span style={{ minWidth: 28, textAlign: 'center' }}>{line.quantity}</span>
                  <button type="button" aria-label={`Add one ${line.title}`} onClick={() => change(line.key, line.quantity + 1)} disabled={line.quantity >= line.available} style={button}>+</button>
                </span>
                <span style={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>{money(line.quantity * line.unitPrice)}</span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #e4e4df' }}>
          <span style={{ color: '#5f6673' }}>{totals.units} {totals.units === 1 ? 'item' : 'items'}</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{money(totals.subtotal)}</span>
        </div>
        <button type="button" disabled style={{ ...button, width: '100%', marginTop: 12, background: '#f3f3ef', color: '#8e8e87' }}>Payment (next step)</button>
      </div>
    </section>
  )
}

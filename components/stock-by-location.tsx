'use client'

import { useState } from 'react'
import { NumInput } from './num-input'
import ui from './admin-ui.module.css'
import s from './admin-product-editor.module.css'

export type StockRow = { id: string; item: string; location: string; quantity: number; reserved: number }

// On-hand stock at each location, one row per stock record (a product, or one of its variants).
// Each row saves on its own, through the product editor's onSave, so it does not wait for the
// rest of the product to be saved.
export default function StockByLocation({ rows, onSave }: { rows: StockRow[]; onSave: (row: StockRow, target: number) => Promise<void> }) {
  const [typed, setTyped] = useState<Record<string, number | null>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  if (!rows.length) return <p className={ui.muted}>No stock records yet. Stock shows here once a location holds some of this product.</p>

  async function save(row: StockRow) {
    const target = typed[row.id] ?? row.quantity
    if (target == null || !Number.isInteger(target) || target < 0) { setError('Stock is a whole number, 0 or more.'); return }
    if (target < row.reserved) { setError(`${row.item} at ${row.location} has ${row.reserved} reserved for orders, so stock cannot go below that.`); return }
    setBusy(row.id); setError('')
    try {
      await onSave(row, target)
      setTyped(t => { const next = { ...t }; delete next[row.id]; return next })
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save stock') }
    finally { setBusy('') }
  }

  return <div>
    <div className={s.stockRows}>
      <div className={s.stockHead}><span>Item</span><span>Location</span><span>On hand</span><span>Reserved</span><span>Available</span><span></span></div>
      {rows.map(row => {
        const value = typed[row.id] ?? row.quantity
        const changed = value !== row.quantity
        return <div className={s.stockRow} key={row.id}>
          <span className={s.stockItem}>{row.item}</span>
          <span className={ui.muted}>{row.location}</span>
          <NumInput className={ui.input} value={value} empty={null} aria-label={`On hand: ${row.item} at ${row.location}`} onValue={v => setTyped(t => ({ ...t, [row.id]: v }))} />
          <span className={ui.muted}>{row.reserved}</span>
          <span>{Math.max(0, value - row.reserved)}</span>
          <button type="button" className={`${ui.btn} ${ui.btnSmall}`} disabled={!changed || busy === row.id} onClick={() => save(row)}>{busy === row.id ? 'Saving…' : 'Save'}</button>
        </div>
      })}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert" style={{ marginTop: 12 }}>{error}</div>}
  </div>
}

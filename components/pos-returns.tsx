'use client'

import { useRef, useState, type FormEvent } from 'react'
import { money } from '@/lib/config'

type Receipt = {
  orderId: string
  orderNumber: string
  createdAt: string
  grandTotal: number
  subtotal: number
  locationName: string
  items: Array<{ orderItemId: string; name: string; sku: string; unitPrice: number; quantity: number; returnable: number }>
}

const METHODS = [
  { value: 'CASH', label: 'Cash from the drawer' },
  { value: 'CARD', label: 'Card (refund on the card terminal)' },
  { value: 'WHISH', label: 'Whish Money (send back manually)' },
  { value: 'OMT', label: 'OMT (send back manually)' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer (send back manually)' },
  { value: 'OTHER', label: 'Other' },
]

const field = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #cfcfc8', font: 'inherit', minWidth: 0 } as const
const button = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #d6d6cf', background: '#fff', cursor: 'pointer', font: 'inherit' } as const
const primary = { ...button, background: '#171717', color: '#fff', border: '1px solid #171717' } as const

/** Find a till receipt, choose what comes back, and record the refund. The server checks everything again. */
export default function PosReturns() {
  const [receiptNumber, setReceiptNumber] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [conditions, setConditions] = useState<Record<string, 'SELLABLE' | 'DAMAGED'>>({})
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('CASH')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'ok' | 'warn'>('warn')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function find(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/admin/pos/returns?receipt=${encodeURIComponent(receiptNumber.trim())}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) {
        setReceipt(null)
        return setMessage(String(data.error ?? 'The receipt could not be found.'))
      }
      setReceipt(data as Receipt)
      setQuantities({})
      setConditions({})
    } catch {
      setMessage('No connection. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // The refund shares out the receipt's discount, as the server does.
  const refundPreview = (() => {
    if (!receipt || receipt.subtotal <= 0) return 0
    const lines = receipt.items.reduce((sum, item) => sum + (Number(quantities[item.orderItemId]) || 0) * item.unitPrice, 0)
    return Math.round((lines * receipt.grandTotal) / receipt.subtotal)
  })()
  const chosen = receipt?.items.filter(item => (Number(quantities[item.orderItemId]) || 0) > 0) ?? []

  async function submit() {
    if (!receipt || busyRef.current) return
    if (chosen.length === 0) return setMessage('Choose at least one item and how many come back.')
    if (reason.trim().length < 3) return setMessage('Write the reason for the return (at least 3 characters).')
    busyRef.current = true
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/pos/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNumber: receipt.orderNumber,
          reason,
          refundMethod: method,
          lines: chosen.map(item => ({ orderItemId: item.orderItemId, quantity: Number(quantities[item.orderItemId]), condition: conditions[item.orderItemId] ?? 'SELLABLE' })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessageTone('warn')
        return setMessage(String(data.error ?? 'The return was not saved. Nothing was refunded.'))
      }
      const amount = money(Number(data.refundCents))
      const manual = method !== 'CASH' && method !== 'CARD' ? ` Send the ${amount} back through ${METHODS.find(m => m.value === method)?.label.split(' (')[0] ?? method} and keep the record.` : ''
      setMessageTone('ok')
      setMessage(`Return recorded. Refund ${amount}. ${data.restocked} ${Number(data.restocked) === 1 ? 'unit' : 'units'} back in stock.${manual}`)
      setReason('')
      await find()
    } catch {
      setMessageTone('warn')
      setMessage('No connection. The return may not have been saved. Check the receipt before trying again.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section style={{ maxWidth: 920, margin: '24px auto', padding: '0 16px', display: 'grid', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Returns and refunds</h1>
        <p style={{ color: '#5f6673', margin: 0, lineHeight: 1.5 }}>Find the till receipt, choose the items that come back, and say whether each one can go back on the shelf.</p>
      </header>

      <form onSubmit={find} role="search" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
        <input value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} placeholder="Receipt number" aria-label="Receipt number" style={field} />
        <button type="submit" disabled={busy || !receiptNumber.trim()} style={primary}>Find receipt</button>
      </form>

      {message && <p role="status" style={{ margin: 0, color: messageTone === 'ok' ? '#2f6b3a' : '#9a5b0f' }}>{message}</p>}

      {receipt && (
        <div style={{ display: 'grid', gap: 12, border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span><strong style={{ fontWeight: 600 }}>Receipt {receipt.orderNumber}</strong><span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{receipt.locationName} · {new Date(receipt.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
            <span style={{ textAlign: 'right' }}>Paid {money(receipt.grandTotal)}</span>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {receipt.items.map(item => (
              <li key={item.orderItemId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)', gap: 8, alignItems: 'center', borderTop: '1px solid #f0f0ec', paddingTop: 8 }}>
                <span><strong style={{ fontWeight: 600 }}>{item.name}</strong><span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{item.sku} · sold {item.quantity} · can return {item.returnable}</span></span>
                <input
                  value={quantities[item.orderItemId] ?? ''}
                  onChange={event => setQuantities(current => ({ ...current, [item.orderItemId]: event.target.value.replace(/[^\d]/g, '') }))}
                  disabled={item.returnable === 0}
                  inputMode="numeric"
                  aria-label={`Units of ${item.name} to return`}
                  placeholder={item.returnable === 0 ? 'Returned' : `0–${item.returnable}`}
                  style={field}
                />
                <select value={conditions[item.orderItemId] ?? 'SELLABLE'} onChange={event => setConditions(current => ({ ...current, [item.orderItemId]: event.target.value as 'SELLABLE' | 'DAMAGED' }))} disabled={item.returnable === 0} aria-label={`Condition of ${item.name}`} style={field}>
                  <option value="SELLABLE">Sellable: back in stock</option>
                  <option value="DAMAGED">Damaged: not restocked</option>
                </select>
                <span style={{ textAlign: 'right', color: '#5f6673' }}>{money(item.unitPrice)} each</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
            <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for the return" aria-label="Reason for the return" style={field} />
            <select value={method} onChange={event => setMethod(event.target.value)} aria-label="How the money goes back" style={field}>
              {METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #e4e4df', paddingTop: 12 }}>
            <span style={{ color: '#5f6673' }}>Refund: <strong style={{ color: '#171717' }}>{money(refundPreview)}</strong>{receipt.subtotal !== receipt.grandTotal ? ' (discount shared out)' : ''}</span>
            <button type="button" onClick={() => void submit()} disabled={busy || chosen.length === 0} style={primary}>Record return and refund</button>
          </div>
        </div>
      )}
    </section>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { money } from '@/lib/config'
import { addToTill, findByCode, searchItems, setQuantity, tillTotals, type TillItem, type TillLine } from '@/lib/pos-till'
import { lbpFromUsdCents, usdCentsFromLbp, type PaymentMethodCode } from '@/lib/pos-payments'
import PosShiftPanel, { parseUsdCents, type TillState } from '@/components/pos-shift-panel'

const button = { minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #d6d6cf', background: '#fff', cursor: 'pointer', font: 'inherit' } as const
const primary = { ...button, background: '#171717', color: '#fff', border: '1px solid #171717' } as const
const field = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #cfcfc8', font: 'inherit', minWidth: 0 } as const

const METHODS: PaymentMethodCode[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'WHISH', 'OMT', 'OTHER']
const METHOD_LABEL: Record<PaymentMethodCode, string> = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', WHISH: 'Whish Money', OMT: 'OMT', OTHER: 'Other' }

type PayLine = { id: number; method: PaymentMethodCode; currency: 'USD' | 'LBP'; amount: string; reference: string }
type Receipt = { orderNumber: string; grandTotalCents: number; changeUsdCents: number }

let lineCounter = 0
const newLine = (currency: 'USD' | 'LBP' = 'USD'): PayLine => ({ id: ++lineCounter, method: 'CASH', currency, amount: '', reference: '' })

function newSaleKey() {
  return `sale-${crypto.randomUUID()}`
}

/**
 * The till: a scan-first search, the cart, the shift, and payment. Prices, stock and totals are
 * checked again on the server; the numbers shown here are for the cashier's convenience.
 */
export default function PosTill({ items }: { items: TillItem[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<TillLine[]>([])
  const [message, setMessage] = useState('')
  const [till, setTill] = useState<TillState | null>(null)
  const [tillError, setTillError] = useState('')
  const [discount, setDiscount] = useState('')
  const [payLines, setPayLines] = useState<PayLine[]>([newLine()])
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [width, setWidth] = useState<'58' | '80'>('80')
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; name: string; email: string; phone: string | null }>>([])
  const inputRef = useRef<HTMLInputElement>(null)
  // One key per sale attempt. Any change to the cart or the payment starts a new attempt, so a
  // retry of the same attempt can never create a second sale.
  const saleKeyRef = useRef<string | null>(null)
  const submittingRef = useRef(false)

  const loadTill = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pos/state', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) return setTillError(String(data.error ?? 'The till could not be loaded.'))
      setTill(data as TillState)
      setTillError('')
    } catch {
      setTillError('No connection. The till could not be loaded.')
    }
  }, [])

  useEffect(() => { void loadTill() }, [loadTill])

  // Customer search: waits for a pause in typing, so one search runs per pause rather than per key.
  useEffect(() => {
    if (customerQuery.trim().length < 2) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/admin/pos/customers?q=${encodeURIComponent(customerQuery.trim())}`, { cache: 'no-store' })
        .then(response => (response.ok ? response.json() : []))
        .then(list => setCustomerResults(Array.isArray(list) ? list : []))
        .catch(() => setCustomerResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [customerQuery])

  const results = useMemo(() => searchItems(items, query), [items, query])
  const totals = tillTotals(lines)
  const discountCents = parseUsdCents(discount) ?? 0
  const grandTotal = Math.max(0, totals.subtotal - discountCents)
  const rate = till?.lbp.enabled ? till.lbp.rate : 0

  // Paid in USD cents, converted at the rate on screen. The server re-checks this exactly.
  const paidUsdCents = payLines.reduce((sum, line) => {
    if (line.currency === 'USD') return sum + (parseUsdCents(line.amount) ?? 0)
    const lbp = /^\d+$/.test(line.amount.trim()) ? Number(line.amount.trim()) : 0
    return sum + (rate > 0 ? usdCentsFromLbp(lbp, rate) : 0)
  }, 0)
  const changeCents = Math.max(0, paidUsdCents - grandTotal)
  const remainingCents = Math.max(0, grandTotal - paidUsdCents)
  const canPay = lines.length > 0 && grandTotal > 0 && paidUsdCents >= grandTotal && !!till?.shift && !submitting && !receipt

  function changed() {
    saleKeyRef.current = null
    setMessage('')
  }

  function add(item: TillItem) {
    const before = lines.find(line => line.key === item.key)?.quantity ?? 0
    const next = addToTill(lines, item)
    const after = next.find(line => line.key === item.key)?.quantity ?? 0
    setMessage(after === before ? (item.available <= 0 ? `${item.title} is out of stock` : `Only ${item.available} of ${item.title} in stock`) : '')
    setLines(next)
    changed()
  }

  function submitSearch(event: FormEvent) {
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

  function changeQuantity(key: string, quantity: number) {
    setLines(setQuantity(lines, key, quantity))
    changed()
  }

  function updateLine(id: number, patch: Partial<PayLine>) {
    setPayLines(current => current.map(line => (line.id === id ? { ...line, ...patch } : line)))
    changed()
  }

  function fillRemaining(id: number) {
    const line = payLines.find(item => item.id === id)
    if (!line) return
    if (line.currency === 'USD') {
      const others = payLines.filter(item => item.id !== id && item.currency === 'USD').reduce((sum, item) => sum + (parseUsdCents(item.amount) ?? 0), 0)
      const left = Math.max(0, grandTotal - others)
      updateLine(id, { amount: (left / 100).toFixed(2) })
    } else if (rate > 0) {
      const others = payLines.filter(item => item.id !== id).reduce((sum, item) => {
        if (item.currency === 'USD') return sum + (parseUsdCents(item.amount) ?? 0)
        return sum + (/^\d+$/.test(item.amount.trim()) ? usdCentsFromLbp(Number(item.amount.trim()), rate) : 0)
      }, 0)
      const leftUsd = Math.max(0, grandTotal - others)
      updateLine(id, { amount: String(lbpFromUsdCents(leftUsd, rate)) })
    }
  }

  function clearSale() {
    setLines([])
    setPayLines([newLine()])
    setDiscount('')
    setReceipt(null)
    setMessage('')
    setCustomer(null)
    setCustomerQuery('')
    saleKeyRef.current = null
    inputRef.current?.focus()
  }

  async function pay() {
    if (submittingRef.current || !canPay) return
    submittingRef.current = true
    setSubmitting(true)
    setMessage('')
    saleKeyRef.current ??= newSaleKey()
    try {
      const payments = payLines.map(line => {
        if (line.currency === 'USD') {
          const cents = parseUsdCents(line.amount)
          return { method: line.method, currency: 'USD', amount: cents ?? 0, reference: line.reference.trim() || null }
        }
        return { method: line.method, currency: 'LBP', amount: /^\d+$/.test(line.amount.trim()) ? Number(line.amount.trim()) : 0, reference: line.reference.trim() || null }
      }).filter(line => line.amount > 0)
      const response = await fetch('/api/admin/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: saleKeyRef.current,
          items: lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
          discountCents,
          customerId: customer?.id ?? null,
          payments,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(String(data.error ?? 'The sale was not saved. Nothing was charged. Please try again.'))
        return
      }
      setReceipt({ orderNumber: data.orderNumber, grandTotalCents: data.grandTotalCents, changeUsdCents: data.changeUsdCents })
      setLines([])
      setPayLines([newLine()])
      setDiscount('')
      setCustomer(null)
      setCustomerQuery('')
      saleKeyRef.current = null
      router.refresh()
    } catch {
      setMessage('No connection. The sale may not have been saved. Check the sales list before trying again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function printReceipt(receiptNumber: string) {
    window.open(`/admin/pos/receipts/${encodeURIComponent(receiptNumber)}?width=${width}`, '_blank', 'noopener')
  }

  return (
    <section style={{ maxWidth: 1080, margin: '20px auto', padding: '0 16px', display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Point of sale</h1>
        {till && <span style={{ color: '#5f6673' }}>Cashier: {till.cashier.name}</span>}
      </header>

      {tillError && <p role="alert" style={{ margin: 0, color: '#9a5b0f' }}>{tillError}</p>}
      {till && <PosShiftPanel state={till} onChanged={() => void loadTill()} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <form onSubmit={submitSearch} role="search">
            <input
              ref={inputRef}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={event => { setQuery(event.target.value); setMessage('') }}
              placeholder="Barcode, SKU or product name"
              aria-label="Barcode, SKU or product name"
              style={{ ...field, width: '100%', minHeight: 52, fontSize: 18, borderRadius: 12 }}
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
              {lines.length > 0 && <button type="button" onClick={clearSale} style={button}>Clear</button>}
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
                      <button type="button" aria-label={`Remove one ${line.title}`} onClick={() => changeQuantity(line.key, line.quantity - 1)} style={button}>−</button>
                      <span style={{ minWidth: 28, textAlign: 'center' }}>{line.quantity}</span>
                      <button type="button" aria-label={`Add one ${line.title}`} onClick={() => changeQuantity(line.key, line.quantity + 1)} disabled={line.quantity >= line.available} style={button}>+</button>
                    </span>
                    <span style={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>{money(line.quantity * line.unitPrice)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside style={{ display: 'grid', gap: 12, border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#5f6673' }}>{totals.units} {totals.units === 1 ? 'item' : 'items'}</span><span>{money(totals.subtotal)}</span></div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#5f6673' }}>Discount (USD)</span>
            <input value={discount} onChange={event => { setDiscount(event.target.value); changed() }} inputMode="decimal" placeholder="0.00" style={{ ...field, width: 120, textAlign: 'right' }} />
          </label>
          {discountCents > totals.subtotal && <p role="alert" style={{ margin: 0, color: '#9a5b0f' }}>The discount is more than the sale.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #e4e4df', paddingTop: 10 }}>
            <span style={{ fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{money(grandTotal)}</span>
          </div>
          {rate > 0 && grandTotal > 0 && <p style={{ margin: 0, color: '#5f6673', fontSize: 13, textAlign: 'right' }}>About LBP {lbpFromUsdCents(grandTotal, rate).toLocaleString('en-US')} at {rate.toLocaleString('en-US')}</p>}

          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 15 }}>Customer</strong>
            {customer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</span>
                <button type="button" onClick={() => { setCustomer(null); changed() }} style={button}>Remove</button>
              </div>
            ) : (
              <>
                <input value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} placeholder="Name, phone or email (optional)" aria-label="Find a customer" style={field} />
                {customerResults.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                    {customerResults.map(found => (
                      <li key={found.id}>
                        <button type="button" onClick={() => { setCustomer({ id: found.id, name: found.name, phone: found.phone }); setCustomerQuery(''); setCustomerResults([]); changed() }} style={{ ...button, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{found.name}</span>
                          <span style={{ color: '#5f6673', fontSize: 13 }}>{found.phone ?? found.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {!receipt && (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong style={{ fontSize: 15 }}>Payment</strong>
              {payLines.map(line => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) 72px minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}>
                  <select value={line.method} onChange={event => updateLine(line.id, { method: event.target.value as PaymentMethodCode, reference: '' })} aria-label="Payment method" style={field}>
                    {METHODS.map(method => <option key={method} value={method}>{METHOD_LABEL[method]}</option>)}
                  </select>
                  <select value={line.currency} onChange={event => updateLine(line.id, { currency: event.target.value as 'USD' | 'LBP', amount: '' })} aria-label="Currency" style={field} disabled={!till?.lbp.enabled && line.currency === 'USD'}>
                    <option value="USD">USD</option>
                    {till?.lbp.enabled && <option value="LBP">LBP</option>}
                  </select>
                  <input value={line.amount} onChange={event => updateLine(line.id, { amount: event.target.value })} inputMode={line.currency === 'USD' ? 'decimal' : 'numeric'} placeholder={line.currency === 'USD' ? '0.00' : 'LBP amount'} aria-label={`${METHOD_LABEL[line.method]} amount`} style={field} />
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => fillRemaining(line.id)} style={{ ...button, minWidth: 44, padding: '0 8px' }} aria-label="Fill the remaining amount">Fill</button>
                    {payLines.length > 1 && <button type="button" onClick={() => { setPayLines(current => current.filter(item => item.id !== line.id)); changed() }} style={{ ...button, minWidth: 44, padding: '0 8px' }} aria-label="Remove this payment">×</button>}
                  </span>
                  {line.method !== 'CASH' && <input value={line.reference} onChange={event => updateLine(line.id, { reference: event.target.value })} placeholder="Reference (transaction or receipt number)" aria-label="Payment reference" style={{ ...field, gridColumn: '1 / -1' }} />}
                </div>
              ))}
              <button type="button" onClick={() => { setPayLines(current => [...current, newLine()]); changed() }} style={button}>+ Add payment</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5f6673' }}>
                <span>Paid</span><span>{money(paidUsdCents)}</span>
              </div>
              {remainingCents > 0 && lines.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remaining</span><strong>{money(remainingCents)}</strong></div>}
              {changeCents > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Change due</span><strong>{money(changeCents)}</strong></div>}
              <button type="button" onClick={() => void pay()} disabled={!canPay} style={{ ...primary, minHeight: 56, fontSize: 17, opacity: canPay ? 1 : 0.5 }}>
                {submitting ? 'Saving the sale…' : !till?.shift ? 'Open a shift to sell' : 'Complete sale'}
              </button>
            </div>
          )}

          {receipt && (
            <div role="status" style={{ display: 'grid', gap: 10, borderTop: '1px solid #e4e4df', paddingTop: 12 }}>
              <strong style={{ fontSize: 17 }}>Sale complete</strong>
              <span style={{ color: '#5f6673' }}>Receipt {receipt.orderNumber}</span>
              {receipt.changeUsdCents > 0 && <strong>Change due: {money(receipt.changeUsdCents)}</strong>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={width} onChange={event => setWidth(event.target.value as '58' | '80')} aria-label="Receipt width" style={field}>
                  <option value="80">80 mm printer</option>
                  <option value="58">58 mm printer</option>
                </select>
                <button type="button" onClick={() => printReceipt(receipt.orderNumber)} style={primary}>Print receipt</button>
                <button type="button" onClick={clearSale} style={button}>New sale</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

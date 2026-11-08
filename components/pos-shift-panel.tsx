'use client'

import { useState, type FormEvent } from 'react'
import { money } from '@/lib/config'

export type TillState = {
  cashier: { id: string; name: string }
  shift: { id: string; openedAt: string; openingCashCents: number; registerName: string; locationName: string } | null
  registers: Array<{ id: string; name: string; locationName: string }>
  lbp: { enabled: boolean; rate: number }
}

const button = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #d6d6cf', background: '#fff', cursor: 'pointer', font: 'inherit' } as const
const primary = { ...button, background: '#171717', color: '#fff', border: '1px solid #171717' } as const
const field = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #cfcfc8', font: 'inherit', minWidth: 0 } as const

/** A dollar amount typed as "12.50" becomes 1250 cents. Anything else is refused, so nothing is guessed. */
export function parseUsdCents(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, data: data as Record<string, unknown> }
}

/** Opening, cash in and out, and closing the cashier's shift. Every action goes to the server. */
export default function PosShiftPanel({ state, onChanged }: { state: TillState; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [registerId, setRegisterId] = useState(state.registers[0]?.id ?? '')
  const [opening, setOpening] = useState('0')
  const [movementKind, setMovementKind] = useState<'CASH_IN' | 'CASH_OUT' | ''>('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [counted, setCounted] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeResult, setCloseResult] = useState<{ expectedCashCents: number; countedCashCents: number; discrepancyCents: number } | null>(null)

  async function run(action: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, success: string) {
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (!result.ok) {
        setMessage(String(result.data.error ?? 'Something went wrong. Please try again.'))
        return
      }
      setMessage(success)
      onChanged()
    } catch {
      setMessage('No connection. Nothing was saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function openShift(event: FormEvent) {
    event.preventDefault()
    const openingCashCents = parseUsdCents(opening)
    if (openingCashCents === null) return setMessage('Type the opening cash in dollars, for example 50.00.')
    if (!registerId) return setMessage('Choose a register.')
    void run(() => post('/api/admin/pos/shifts', { registerId, openingCashCents }), 'Shift opened.')
  }

  function recordMovement(event: FormEvent) {
    event.preventDefault()
    const amountCents = parseUsdCents(movementAmount)
    if (!movementKind) return setMessage('Choose cash in or cash out.')
    if (amountCents === null || amountCents === 0) return setMessage('Type the amount in dollars, for example 20.00.')
    void run(async () => {
      const result = await post('/api/admin/pos/shifts/cash', { kind: movementKind, amountCents, reason: movementReason })
      if (result.ok) {
        setMovementAmount('')
        setMovementReason('')
        setMovementKind('')
      }
      return result
    }, movementKind === 'CASH_IN' ? 'Cash in recorded.' : 'Cash out recorded.')
  }

  async function closeShift(event: FormEvent) {
    event.preventDefault()
    const countedCashCents = parseUsdCents(counted)
    if (countedCashCents === null) return setMessage('Type the counted cash in dollars, for example 120.50.')
    setBusy(true)
    setMessage('')
    try {
      const result = await post('/api/admin/pos/shifts/close', { countedCashCents, note: closeNote })
      if (!result.ok) return setMessage(String(result.data.error ?? 'The shift could not be closed.'))
      setCloseResult({
        expectedCashCents: Number(result.data.expectedCashCents),
        countedCashCents: Number(result.data.countedCashCents),
        discrepancyCents: Number(result.data.discrepancyCents),
      })
      setClosing(false)
      onChanged()
    } catch {
      setMessage('No connection. The shift was not closed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!state.shift) {
    return (
      <form onSubmit={openShift} style={{ display: 'grid', gap: 10, border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
        <strong style={{ fontSize: 16 }}>Open a shift</strong>
        {closeResult && (
          <p role="status" style={{ margin: 0 }}>
            Last shift closed. Expected {money(closeResult.expectedCashCents)}, counted {money(closeResult.countedCashCents)}, difference {money(closeResult.discrepancyCents)}.
          </p>
        )}
        {state.registers.length === 0 ? (
          <p style={{ margin: 0, color: '#9a5b0f' }}>No register is switched on yet. A manager adds one under Point of sale → Registers.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8 }}>
            <select value={registerId} onChange={event => setRegisterId(event.target.value)} aria-label="Register" style={field}>
              {state.registers.map(register => <option key={register.id} value={register.id}>{register.name} · {register.locationName}</option>)}
            </select>
            <input value={opening} onChange={event => setOpening(event.target.value)} inputMode="decimal" aria-label="Opening cash in dollars" placeholder="Opening cash (USD)" style={field} />
            <button type="submit" disabled={busy} style={primary}>Open shift</button>
          </div>
        )}
        {message && <p role="status" style={{ margin: 0, color: '#9a5b0f' }}>{message}</p>}
      </form>
    )
  }

  const shift = state.shift
  return (
    <div style={{ display: 'grid', gap: 10, border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>
          <strong style={{ fontSize: 16 }}>{shift.registerName}</strong>
          <span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>{shift.locationName} · opened {new Date(shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · opening cash {money(shift.openingCashCents)}</span>
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setMovementKind('CASH_IN'); setMessage('') }} disabled={busy} style={button}>Cash in</button>
          <button type="button" onClick={() => { setMovementKind('CASH_OUT'); setMessage('') }} disabled={busy} style={button}>Cash out</button>
          <button type="button" onClick={() => { setClosing(v => !v); setCloseResult(null); setMessage('') }} disabled={busy} style={button}>Close shift</button>
        </span>
      </div>

      {movementKind && (
        <form onSubmit={recordMovement} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) auto', gap: 8 }}>
          <input value={movementAmount} onChange={event => setMovementAmount(event.target.value)} inputMode="decimal" aria-label="Amount in dollars" placeholder="Amount (USD)" style={field} />
          <input value={movementReason} onChange={event => setMovementReason(event.target.value)} aria-label="Reason" placeholder={movementKind === 'CASH_IN' ? 'Reason (e.g. change float)' : 'Reason (e.g. bank drop)'} style={field} />
          <button type="submit" disabled={busy} style={primary}>{movementKind === 'CASH_IN' ? 'Record cash in' : 'Record cash out'}</button>
        </form>
      )}

      {closing && (
        <form onSubmit={closeShift} style={{ display: 'grid', gap: 8, borderTop: '1px solid #f0f0ec', paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) auto', gap: 8 }}>
            <input value={counted} onChange={event => setCounted(event.target.value)} inputMode="decimal" aria-label="Counted cash in dollars" placeholder="Counted cash (USD)" style={field} />
            <input value={closeNote} onChange={event => setCloseNote(event.target.value)} aria-label="Note" placeholder="Note (required if the cash does not match)" style={field} />
            <button type="submit" disabled={busy} style={primary}>Close shift</button>
          </div>
          <p style={{ margin: 0, color: '#5f6673', fontSize: 13 }}>The expected cash is worked out from the sales and cash movements. A difference needs a note.</p>
        </form>
      )}

      {closeResult && (
        <p role="status" style={{ margin: 0 }}>
          Shift closed. Expected {money(closeResult.expectedCashCents)}, counted {money(closeResult.countedCashCents)}, difference {money(closeResult.discrepancyCents)}.
        </p>
      )}
      {message && <p role="status" style={{ margin: 0, color: '#9a5b0f' }}>{message}</p>}
    </div>
  )
}

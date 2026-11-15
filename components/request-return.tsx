'use client'
import { useState } from 'react'
import { NumInput } from './num-input'
import { useI18n } from '@/components/lang-provider'
import { dateLocale, markT } from '@/lib/i18n'
import { fetchRead } from '@/lib/retry-fetch'

type OrderItem = { id: string; name: string; quantity: number; remaining: number }
type ReturnRequest = { id: string; status: string; reason: string; createdAt: string; items: { orderItemId: string; quantity: number }[] }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: markT('Requested'), APPROVED: markT('Approved — awaiting your shipment'), RECEIVED: markT('Received'),
  REFUNDED: markT('Refunded'), REJECTED: markT('Declined'), CANCELLED: markT('Cancelled'),
}

async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function RequestReturn({ orderNumber, items, returns }: { orderNumber: string; items: OrderItem[]; returns: ReturnRequest[] }) {
  const { t, count, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The return to cancel, while the customer is asked to confirm (no browser dialog).
  const [askCancel, setAskCancel] = useState<string | null>(null)

  const returnable = items.filter(i => i.remaining > 0)

  function startRequest() {
    setQuantities(Object.fromEntries(returnable.map(i => [i.id, 0])))
    setReason('')
    setError('')
    setOpen(true)
  }

  async function submit() {
    const selected = Object.entries(quantities).filter(([, qty]) => qty > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    if (!selected.length) { setError(t('Choose a quantity for at least one item.')); return }
    if (!reason.trim()) { setError(t('Please tell us why you want to return these items.')); return }
    setBusy(true); setError('')
    try {
      await api(`/api/account/orders/${encodeURIComponent(orderNumber)}/return`, { method: 'POST', body: JSON.stringify({ items: selected, reason: reason.trim() }) })
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to submit your return request'))
      setBusy(false)
    }
  }

  async function cancelRequest(id: string) {
    setAskCancel(null)
    setBusy(true); setError('')
    try {
      await api(`/api/account/orders/${encodeURIComponent(orderNumber)}/return?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to cancel this return request'))
      setBusy(false)
    }
  }

  return <div className="card" style={{ padding: 20, marginTop: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3>{t('Returns')}</h3>
      {!open && returnable.length > 0 && <button className="btn secondary" type="button" onClick={startRequest}>{t('Request a return')}</button>}
    </div>

    {error && <p className="muted" style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{error}</p>}

    {returns.length > 0 && <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {returns.map(r => <div key={r.id} className="summaryLine" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>{count(r.items.reduce((s, i) => s + i.quantity, 0), 'item')}</strong>
          <p className="muted" style={{ margin: '2px 0' }}>{r.reason}</p>
          <small className="muted">{new Date(r.createdAt).toLocaleString(dateLocale(lang))}</small>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className="pill">{t(STATUS_LABEL[r.status] || r.status)}</span>
          {r.status === 'REQUESTED' && (askCancel === r.id
            ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <span>{t('Cancel this return request?')}</span>
              <button className="textLink" type="button" disabled={busy} onClick={() => cancelRequest(r.id)}>{t('Yes, cancel it')}</button>
              <button className="textLink" type="button" disabled={busy} onClick={() => setAskCancel(null)}>{t('Keep it')}</button>
            </span>
            : <button className="textLink" type="button" disabled={busy} onClick={() => setAskCancel(r.id)}>{t('Cancel request')}</button>)}
        </div>
      </div>)}
    </div>}

    {!returns.length && !open && <p className="muted">{returnable.length ? t('Not happy with something? You can request a return above.') : t('No return requests for this order.')}</p>}

    {open && <div style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {returnable.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>{item.name} <span className="muted">{t('({n} can be returned)', { n: item.remaining })}</span></span>
          <NumInput className="input" style={{ width: 80 }} value={quantities[item.id] ?? 0} onValue={n => setQuantities(current => ({ ...current, [item.id]: Math.max(0, Math.min(item.remaining, Number(n) || 0)) }))} />
        </div>)}
      </div>
      <label className="fieldLabel" style={{ marginTop: 12 }}>{t('Reason for return')}<textarea className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('Why are you returning these items?')} /></label>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn" type="button" disabled={busy} onClick={submit}>{busy ? t('Submitting…') : t('Submit request')}</button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </div>
    </div>}
  </div>
}

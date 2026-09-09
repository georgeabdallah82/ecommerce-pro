'use client'

import { useMemo, useState } from 'react'
import { CreditCard, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-gift-cards.module.css'

type GiftCard = {
  id: string
  code: string
  last4: string
  customerId: string | null
  initialAmount: number
  balance: number
  currency: string
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED'
  expiresAt: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_TONE: Record<string, string> = { ACTIVE: 'success', DISABLED: 'danger', EXPIRED: 'warning' }
const STATUSES = ['ACTIVE', 'DISABLED', 'EXPIRED'] as const

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function GiftCardsAdmin({ initial, canManage, defaultCurrency }: { initial: GiftCard[]; canManage: boolean; defaultCurrency: string }) {
  const [rows, setRows] = useState<GiftCard[]>(initial || [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [code, setCode] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [manageCard, setManageCard] = useState<GiftCard | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [manageNote, setManageNote] = useState('')
  const [manageExpiresAt, setManageExpiresAt] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(card => {
      if (status !== 'ALL' && card.status !== status) return false
      if (!needle) return true
      return `${card.code} ${card.last4}`.toLowerCase().includes(needle)
    })
  }, [rows, q, status])

  async function search() {
    setLoading(true); setError('')
    try { setRows(await api(`/api/admin/gift-cards${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load gift cards') }
    finally { setLoading(false) }
  }

  function openCreate() {
    setCreateOpen(true); setAmount(''); setCurrency(defaultCurrency); setCode(''); setCustomerId(''); setExpiresAt(''); setNote(''); setCreateError('')
  }
  function closeCreate() { setCreateOpen(false) }

  async function createGiftCard() {
    const dollars = Number(amount)
    if (!Number.isFinite(dollars) || dollars <= 0) { setCreateError('Enter an initial balance greater than zero.'); return }
    setCreating(true); setCreateError('')
    try {
      const data = await api('/api/admin/gift-cards', {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(dollars * 100),
          currency: currency.trim() || defaultCurrency,
          code: code.trim() || undefined,
          customerId: customerId.trim() || undefined,
          expiresAt: expiresAt || undefined,
          note: note.trim() || undefined,
        }),
      })
      setRows(current => [data.giftCard, ...current])
      setNotice(`Gift card ${data.giftCard.code} created.`)
      setCreateOpen(false)
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'Unable to create gift card') }
    finally { setCreating(false) }
  }

  function openManage(card: GiftCard) {
    setManageCard(card); setAdjustAmount(''); setManageNote(card.note || ''); setManageExpiresAt(card.expiresAt ? card.expiresAt.slice(0, 10) : ''); setManageError('')
  }
  function closeManage() { setManageCard(null) }

  function applyUpdate(id: string, giftCard: GiftCard) {
    setRows(current => current.map(c => (c.id === id ? giftCard : c)))
    setManageCard(giftCard)
  }

  async function adjustBalance(delta: 1 | -1) {
    if (!manageCard) return
    const dollars = Number(adjustAmount)
    if (!Number.isFinite(dollars) || dollars <= 0) { setManageError('Enter a positive adjustment amount.'); return }
    setAdjustBusy(true); setManageError('')
    try {
      const data = await api('/api/admin/gift-cards', { method: 'PATCH', body: JSON.stringify({ id: manageCard.id, adjustment: delta * Math.round(dollars * 100) }) })
      applyUpdate(manageCard.id, data.giftCard)
      setAdjustAmount(''); setNotice('Gift card balance updated.')
    } catch (e) { setManageError(e instanceof Error ? e.message : 'Unable to adjust balance') }
    finally { setAdjustBusy(false) }
  }

  async function changeStatus(nextStatus: string) {
    if (!manageCard || nextStatus === manageCard.status) return
    setManageBusy(true); setManageError('')
    try {
      const data = await api('/api/admin/gift-cards', { method: 'PATCH', body: JSON.stringify({ id: manageCard.id, status: nextStatus }) })
      applyUpdate(manageCard.id, data.giftCard)
      setNotice('Gift card status updated.')
    } catch (e) { setManageError(e instanceof Error ? e.message : 'Unable to update status') }
    finally { setManageBusy(false) }
  }

  async function saveDetails() {
    if (!manageCard) return
    setManageBusy(true); setManageError('')
    try {
      const data = await api('/api/admin/gift-cards', {
        method: 'PATCH',
        body: JSON.stringify({ id: manageCard.id, note: manageNote.trim(), expiresAt: manageExpiresAt || null }),
      })
      applyUpdate(manageCard.id, data.giftCard)
      setNotice('Gift card details saved.')
    } catch (e) { setManageError(e instanceof Error ? e.message : 'Unable to save gift card') }
    finally { setManageBusy(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><span className="muted tiny">CUSTOMERS</span><h1 className="h2">Gift cards</h1><p className="muted">Issue store credit cards and manage balances, status and expiry.</p></div>
      <div className="inline">
        <button className="btn secondary" onClick={search} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        {canManage && <button className="btn" onClick={openCreate}><Plus size={15} /> New gift card</button>}
      </div>
    </div>

    {(error || notice) && <div className={error ? 'alert danger' : 'alert'}>{error || notice}</div>}

    <div className={`card ${styles.toolbar}`}>
      <div className={styles.search}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Search by code or last 4 digits…" /></div>
      <select className="input compact" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="ALL">All statuses</option>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="btn secondary" onClick={search} disabled={loading}>Search</button>
    </div>

    <div className="card productTableCard">
      <div className="tableWrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Balance</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {shown.map(card => <tr key={card.id}>
              <td><strong>{card.code}</strong><div className="muted">•••• {card.last4}</div></td>
              <td><strong>{money(card.balance, card.currency)}</strong><div className="muted">of {money(card.initialAmount, card.currency)}</div></td>
              <td><span className={`statusPill ${STATUS_TONE[card.status] || ''}`}>{card.status}</span></td>
              <td className="muted">{new Date(card.createdAt).toLocaleDateString()}</td>
              <td className="muted">{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString() : 'No expiry'}</td>
              <td>{canManage && <button className="iconBtn" title="Manage gift card" onClick={() => openManage(card)}><Settings2 size={15} /></button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!shown.length && <div className="empty"><CreditCard size={28} /><h3>No gift cards found</h3><p className="muted">{canManage ? 'Issue a gift card to see it here.' : 'Gift cards issued by staff will show up here.'}</p></div>}
    </div>

    {createOpen && <div className="modalOverlay" onClick={closeCreate}>
      <div className={`card ${styles.modal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div><span className="muted tiny">NEW GIFT CARD</span><h2>Issue a gift card</h2><p className="muted">A code is generated automatically unless you provide one.</p></div>
          <button className="iconBtn" onClick={closeCreate}><X size={17} /></button>
        </div>
        <div className={styles.modalBody}>
          {createError && <div className="alert danger">{createError}</div>}
          <div className="twoColFields">
            <label className="fieldLabel">Initial balance<input className="input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50.00" autoFocus /></label>
            <label className="fieldLabel">Currency<input className="input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder={defaultCurrency} /></label>
          </div>
          <div className="twoColFields">
            <label className="fieldLabel">Code (optional)<input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Auto-generated" /></label>
            <label className="fieldLabel">Expiry date (optional)<input className="input" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
          </div>
          <label className="fieldLabel">Customer ID (optional)<input className="input" value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="Link this card to a customer record" /></label>
          <label className="fieldLabel">Note (optional)<textarea className="textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note" /></label>
          <div className={styles.modalFooter}>
            <button className="btn secondary" onClick={closeCreate} disabled={creating}>Cancel</button>
            <button className="btn" onClick={createGiftCard} disabled={creating}>{creating ? 'Issuing…' : 'Issue gift card'}</button>
          </div>
        </div>
      </div>
    </div>}

    {manageCard && <div className="modalOverlay" onClick={closeManage}>
      <div className={`card ${styles.modal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div><span className="muted tiny">GIFT CARD</span><h2>{manageCard.code}</h2><p className="muted">{money(manageCard.balance, manageCard.currency)} available of {money(manageCard.initialAmount, manageCard.currency)}</p></div>
          <button className="iconBtn" onClick={closeManage}><X size={17} /></button>
        </div>
        <div className={styles.modalBody}>
          {manageError && <div className="alert danger">{manageError}</div>}

          <div className={styles.manageSection}>
            <label className="fieldLabel">Adjust balance<input className="input" type="number" min="0" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="0.00" /></label>
            <div className="inline">
              <button className="btn secondary" onClick={() => adjustBalance(1)} disabled={adjustBusy || !adjustAmount}>{adjustBusy ? 'Updating…' : 'Add funds'}</button>
              <button className="btn secondary" onClick={() => adjustBalance(-1)} disabled={adjustBusy || !adjustAmount}>{adjustBusy ? 'Updating…' : 'Deduct funds'}</button>
            </div>
          </div>

          <div className={styles.manageSection}>
            <span className="fieldLabel">Status</span>
            <div className="inline">
              {STATUSES.map(s => <button key={s} type="button" className={s === manageCard.status ? 'btn smallBtn' : 'btn secondary smallBtn'} disabled={manageBusy} onClick={() => changeStatus(s)}>{s}</button>)}
            </div>
          </div>

          <div className={styles.manageSection}>
            <label className="fieldLabel">Expiry date<input className="input" type="date" value={manageExpiresAt} onChange={e => setManageExpiresAt(e.target.value)} /></label>
            <label className="fieldLabel">Note<textarea className="textarea" rows={2} value={manageNote} onChange={e => setManageNote(e.target.value)} /></label>
            <button className="btn secondary" onClick={saveDetails} disabled={manageBusy}>{manageBusy ? 'Saving…' : 'Save details'}</button>
          </div>
        </div>
      </div>
    </div>}
  </div>
}

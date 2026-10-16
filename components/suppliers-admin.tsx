'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { ArrowLeft, Check, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { displayPhone } from '@/lib/checkout-followup'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

type Row = { name: string; phone: string; contact: string; note: string; products: number; added?: boolean }

// Products > Suppliers (app/admin/inventory/suppliers): a WhatsApp number for each supplier, so
// What to reorder sends the order list straight to their chat.
export default function SuppliersAdmin({ initial, canEdit }: { initial: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(r => ({ ...r, phone: r.phone ? displayPhone(r.phone) : '' })))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const set = (i: number, patch: Partial<Row>) => setRows(list => list.map((r, j) => j === i ? { ...r, ...patch } : r))

  async function save() {
    setBusy(true); setMsg(''); setError('')
    try {
      const suppliers = rows.filter(r => r.name.trim() && (r.phone.trim() || r.contact.trim() || r.note.trim() || !r.products)).map(({ name, phone, contact, note }) => ({ name, phone, contact, note }))
      const res = await fetch('/api/admin/suppliers', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ suppliers }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Unable to save')
      setRows(list => list.map(r => ({ ...r, added: false })))
      setMsg('Saved. "Send to the supplier" on What to reorder now opens their WhatsApp chat.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/inventory/reorder"><ArrowLeft size={15} /> What to reorder</Link>
    <div>
      <h1 className={s.title}>Suppliers</h1>
      <p className={s.subtitle}>The people you buy from. Products are matched to a supplier by their &quot;Vendor / brand&quot;. Add each supplier&apos;s WhatsApp number and the order list from What to reorder goes straight to their chat.</p>
    </div>
    {(error || msg) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || msg}</div>}
    {!rows.length && <div className={`${ui.card} ${ui.empty}`}><h3>No suppliers yet</h3><p className={ui.muted}>Fill in &quot;Vendor / brand&quot; on your products, or add a supplier here.</p></div>}
    {rows.map((r, i) => {
      const digits = r.phone.replace(/\D/g, '')
      return <section key={i} className={`${ui.card} ${s.card}`}>
        <div className={s.head}>
          <div style={{ flex: 1 }}>
            {r.products ? <strong className={s.name}>{r.name}</strong> : <input className={ui.input} value={r.name} onChange={e => set(i, { name: e.target.value })} placeholder="Supplier name" aria-label="Supplier name" disabled={!canEdit} />}
            <div className={s.meta}><span>{r.products ? `${r.products} product${r.products === 1 ? '' : 's'}` : 'No products yet: write this name as the products’ Vendor / brand'}</span></div>
          </div>
          {!r.products && canEdit && <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => setRows(list => list.filter((_, j) => j !== i))} aria-label={`Remove ${r.name || 'supplier'}`}><Trash2 size={15} /></button>}
        </div>
        <div className={s.row}>
          <input className={ui.input} value={r.phone} onChange={e => set(i, { phone: e.target.value })} placeholder="WhatsApp, e.g. 70 123 456" aria-label={`WhatsApp number for ${r.name || 'supplier'}`} inputMode="tel" disabled={!canEdit} />
          <input className={ui.input} value={r.contact} onChange={e => set(i, { contact: e.target.value })} placeholder="Contact person" aria-label={`Contact person at ${r.name || 'supplier'}`} disabled={!canEdit} />
        </div>
        <input className={ui.input} value={r.note} onChange={e => set(i, { note: e.target.value })} placeholder="Note, e.g. delivers on Tuesdays, pays cash" aria-label={`Note for ${r.name || 'supplier'}`} disabled={!canEdit} />
        {digits.length >= 8 && <div className={s.actions}><a className={`${ui.btn} ${s.whatsapp}`} href={`https://wa.me/${digits.length <= 8 ? `961${digits.replace(/^0/, '')}` : digits}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Chat</a></div>}
      </section>
    })}
    {canEdit && <div className={s.actions}>
      <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setRows(list => [...list, { name: '', phone: '', contact: '', note: '', products: 0, added: true }])}><Plus size={16} /> Add a supplier</button>
      <button type="button" className={ui.btn} onClick={save} disabled={busy}><Check size={16} /> {busy ? 'Saving...' : 'Save'}</button>
    </div>}
  </div>
}

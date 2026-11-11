'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, ArrowLeft, Check, MessageCircle, Plus, Search, Trash2 } from 'lucide-react'
import { displayPhone } from '@/lib/checkout-followup'
import { internationalPhone } from '@/lib/phone'
import { MAX_SUPPLIERS, supplierHealth, supplierKey, type SupplierHealth } from '@/lib/suppliers'
import { useConfirm } from './admin-confirm'
import s from './suppliers-admin.module.css'
import ui from './admin-ui.module.css'

export type SupplierRow = { name: string; phone: string; contact: string; note: string; products: number; orders: number; open: number; lastOrderedAt: string | null }
type Draft = SupplierRow & { key: number; isNew: boolean }
type Filter = 'all' | 'attention' | 'ready'

const FIELDS = ['name', 'phone', 'contact', 'note'] as const
let nextKey = 1
const draftFrom = (row: SupplierRow, country: string, isNew = false): Draft => {
  const full = internationalPhone(row.phone, country)
  return { ...row, phone: full ? displayPhone(full) : row.phone, key: nextKey++, isNew }
}
// What is saved: the editable fields, in order. Used to tell whether anything has changed.
const snapshotOf = (list: Draft[]) => JSON.stringify(list.map(d => FIELDS.map(f => d[f])))
const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Ready means the order list can reach them: a valid number, and at least one product whose
// Vendor / brand is their name (the reorder page groups by that name).
type Status = SupplierHealth | 'unlinked'
const STATUS_TEXT: Record<Status, string> = { ready: 'Ready to order', 'no-number': 'No WhatsApp number', 'number-invalid': 'Check the number', unlinked: 'No products use this name' }
const STATUS_CLASS: Record<Status, string> = { ready: s.statusReady, 'no-number': s.statusWarn, 'number-invalid': s.statusDanger, unlinked: s.statusWarn }
const statusOf = (d: Draft, country: string): Status => {
  const health = supplierHealth(d.phone, country)
  return health === 'ready' && d.products === 0 ? 'unlinked' : health
}

// Products > Suppliers (app/admin/inventory/suppliers). Each supplier has a WhatsApp number so
// "Send to the supplier" on What to reorder opens their chat. Edits are checked as you type and
// saved together; nothing is lost by leaving until you choose to.
export default function SuppliersAdmin({ initial, country, canEdit }: { initial: SupplierRow[]; country: string; canEdit: boolean }) {
  const confirm = useConfirm()
  // The list as it was last saved (or loaded). Discard goes back to exactly this.
  const [savedDrafts, setSavedDrafts] = useState<Draft[]>(() => initial.map(row => draftFrom(row, country)))
  const [drafts, setDrafts] = useState<Draft[]>(savedDrafts)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const saved = useMemo(() => snapshotOf(savedDrafts), [savedDrafts])
  const dirty = snapshotOf(drafts) !== saved
  const update = (key: number, patch: Partial<Draft>) => setDrafts(list => list.map(d => (d.key === key ? { ...d, ...patch } : d)))

  // Duplicate names are found across the whole list, as the reorder page groups by name.
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const d of drafts) out.set(supplierKey(d.name), (out.get(supplierKey(d.name)) || 0) + 1)
    return out
  }, [drafts])

  // The problems for each supplier. Saving is blocked until there are none.
  const problems = useMemo(() => {
    const out = new Map<number, { name?: string; phone?: string }>()
    for (const d of drafts) {
      const p: { name?: string; phone?: string } = {}
      if (!d.name.trim()) p.name = 'Give this supplier a name'
      else if ((counts.get(supplierKey(d.name)) || 0) > 1) p.name = 'Another supplier has this name'
      if (d.phone.trim() && !internationalPhone(d.phone, country)) p.phone = 'Check this number, for example 70 123 456'
      if (p.name || p.phone) out.set(d.key, p)
    }
    return out
  }, [drafts, counts, country])
  const problemCount = problems.size

  const summary = useMemo(() => {
    const statuses = drafts.map(d => statusOf(d, country))
    return {
      suppliers: drafts.length,
      products: drafts.reduce((sum, d) => sum + d.products, 0),
      ready: statuses.filter(x => x === 'ready').length,
      attention: statuses.filter(x => x !== 'ready').length,
    }
  }, [drafts, country])

  const shown = drafts.filter(d => {
    const q = query.trim().toLowerCase()
    if (q && !`${d.name} ${d.contact} ${d.note}`.toLowerCase().includes(q)) return false
    const status = statusOf(d, country)
    if (filter === 'attention') return status !== 'ready'
    if (filter === 'ready') return status === 'ready'
    return true
  })

  // Leaving with unsaved changes asks first; Ctrl/Cmd+S saves.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    if (busy || !dirty || problemCount) return
    setBusy(true); setMsg(''); setError('')
    try {
      const payload = drafts.filter(d => d.name.trim()).map(({ name, phone, contact, note }) => ({ name: name.trim(), phone, contact, note }))
      const res = await fetch('/api/admin/suppliers', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ suppliers: payload }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save')
      const next = drafts.map(d => ({ ...d, isNew: false }))
      setDrafts(next)
      setSavedDrafts(next)
      setMsg('Saved. "Send to the supplier" on What to reorder now opens their WhatsApp chat.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // save() reads the current list, so the listener follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, savedDrafts, busy, problemCount])

  async function discard() {
    if (!dirty) return
    if (!(await confirm({ title: 'Discard your changes?', message: 'Suppliers go back to how they were when you last saved.', confirmLabel: 'Discard changes', tone: 'danger' }))) return
    setDrafts(savedDrafts)
    setError(''); setMsg('')
  }

  async function remove(d: Draft) {
    if (!(await confirm({ title: `Remove ${d.name || 'this supplier'}?`, message: 'It is removed when you save.', confirmLabel: 'Remove', tone: 'danger' }))) return
    setDrafts(list => list.filter(x => x.key !== d.key))
  }

  function add() {
    if (drafts.length >= MAX_SUPPLIERS) { setError(`Up to ${MAX_SUPPLIERS} suppliers`); return }
    const row = draftFrom({ name: '', phone: '', contact: '', note: '', products: 0, orders: 0, open: 0, lastOrderedAt: null }, country, true)
    setDrafts(list => [row, ...list])
    setQuery(''); setFilter('all')
    window.setTimeout(() => document.getElementById(`supplier-name-${row.key}`)?.focus(), 0)
  }

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/inventory/reorder"><ArrowLeft size={15} /> What to reorder</Link>

    <header className={s.header}>
      <div>
        <h1 className={s.title}>Suppliers</h1>
        <p className={s.subtitle}>The people you buy from. A product belongs to a supplier through its &ldquo;Vendor / brand&rdquo;, so a supplier with products stays here until those products change. Add each supplier&rsquo;s WhatsApp number and the order list from What to reorder opens their chat.</p>
      </div>
      {canEdit && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={add}><Plus size={16} /> Add supplier</button>}
    </header>

    <div className={s.summary} aria-label="Suppliers at a glance">
      <div><strong>{summary.suppliers}</strong><span>Suppliers</span></div>
      <div><strong>{summary.products}</strong><span>Products covered</span></div>
      <div><strong>{summary.ready}</strong><span>Ready to order</span></div>
      <div className={summary.attention ? s.summaryWarn : undefined}><strong>{summary.attention}</strong><span>Need attention</span></div>
    </div>

    {msg && <div className={ui.alert} role="status">{msg}</div>}
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {problemCount > 0 && dirty && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert"><AlertTriangle size={15} /> {plural(problemCount, 'supplier')} to fix before saving.</div>}

    {drafts.length > 0 && <div className={s.toolbar}>
      <label className={s.search}>
        <Search size={15} aria-hidden="true" />
        <input className={s.searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, contact or note" aria-label="Search suppliers" />
      </label>
      <div className={s.segmented} role="group" aria-label="Show">
        {([['all', 'All'], ['attention', 'Need attention'], ['ready', 'Ready']] as Array<[Filter, string]>).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? s.segOn : undefined} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
    </div>}

    {!drafts.length && <div className={`${ui.card} ${s.empty}`}>
      <h2>No suppliers yet</h2>
      <p className={ui.muted}>Suppliers come from each product&rsquo;s &ldquo;Vendor / brand&rdquo;. Add one here to give it a WhatsApp number now.</p>
      {canEdit && <button type="button" className={ui.btn} onClick={add}><Plus size={16} /> Add supplier</button>}
    </div>}

    {drafts.length > 0 && !shown.length && <p className={ui.muted} role="status">No suppliers match. Try another search or filter.</p>}

    <div className={s.list}>
      {shown.map(d => {
        const status = statusOf(d, country)
        const problem = problems.get(d.key) || {}
        const digits = internationalPhone(d.phone, country)
        const nameEditable = canEdit && d.products === 0
        const productsText = d.products ? plural(d.products, 'product') : 'No product uses this name yet'
        const ordersText = d.orders ? `${plural(d.orders, 'order')}${d.lastOrderedAt ? `, last ${dateText(d.lastOrderedAt)}` : ''}` : 'Not ordered from yet'
        return <section key={d.key} className={`${ui.card} ${s.card}`} aria-label={d.name || 'New supplier'}>
          <header className={s.cardHead}>
            <div className={s.identity}>
              {nameEditable
                ? <>
                  <input id={`supplier-name-${d.key}`} className={`${ui.input} ${problem.name ? s.invalid : ''}`} value={d.name} onChange={e => update(d.key, { name: e.target.value })} placeholder="Supplier name" aria-label="Supplier name" aria-invalid={!!problem.name} />
                  {problem.name && <span className={s.error}>{problem.name}</span>}
                </>
                : <h2 className={s.name}>{d.name}</h2>}
              <p className={s.meta}>{productsText} · {ordersText}</p>
            </div>
            <span className={`${s.status} ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</span>
          </header>

          <div className={s.fields}>
            <div className={s.field}>
              <label className={ui.fieldLabel} htmlFor={`supplier-phone-${d.key}`}>WhatsApp</label>
              <div className={s.phoneRow}>
                <input id={`supplier-phone-${d.key}`} className={`${ui.input} ${problem.phone ? s.invalid : ''}`} value={d.phone} onChange={e => update(d.key, { phone: e.target.value })} placeholder="70 123 456" inputMode="tel" disabled={!canEdit} aria-invalid={!!problem.phone} />
                {supplierHealth(d.phone, country) === 'ready' && digits && <a className={`${ui.btn} ${s.chat}`} href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Chat</a>}
              </div>
              {problem.phone
                ? <span className={s.error}>{problem.phone}</span>
                : <span className={ui.fieldHelp}>{supplierHealth(d.phone, country) === 'ready' ? `Orders go to +${digits}` : 'Used by Send to the supplier on What to reorder'}</span>}
            </div>
            <div className={s.field}>
              <label className={ui.fieldLabel} htmlFor={`supplier-contact-${d.key}`}>Contact person</label>
              <input id={`supplier-contact-${d.key}`} className={ui.input} value={d.contact} onChange={e => update(d.key, { contact: e.target.value })} placeholder="Name" disabled={!canEdit} />
            </div>
            <div className={`${s.field} ${s.wide}`}>
              <label className={ui.fieldLabel} htmlFor={`supplier-note-${d.key}`}>Note</label>
              <input id={`supplier-note-${d.key}`} className={ui.input} value={d.note} onChange={e => update(d.key, { note: e.target.value })} placeholder="For example: delivers on Tuesdays, pays cash" disabled={!canEdit} />
            </div>
          </div>

          {canEdit && d.products === 0 && <footer className={s.cardFoot}>
            <button type="button" className={`${ui.textButton} ${ui.textButtonDanger}`} onClick={() => remove(d)} aria-label={`Remove ${d.name || 'supplier'}`}><Trash2 size={14} /> Remove</button>
          </footer>}
        </section>
      })}
    </div>

    {canEdit && dirty && <div className={s.saveBar} role="region" aria-label="Unsaved changes">
      <span>{problemCount ? 'Fix the highlighted fields to save' : 'Unsaved changes'}</span>
      <div className={s.saveActions}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => void discard()} disabled={busy}>Discard</button>
        <button type="button" className={ui.btn} onClick={save} disabled={busy || problemCount > 0}><Check size={16} /> {busy ? 'Saving…' : 'Save suppliers'}</button>
      </div>
    </div>}
  </div>
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, ArrowLeft, Check, Eye, RotateCcw, Search, X } from 'lucide-react'
import { money } from '@/lib/config'
import { PRICE_MODES, type CompareAtRule, type PriceMode, type PricePreview, type Rounding } from '@/lib/bulk-prices'
import { useConfirm } from './admin-confirm'
import { NumInput } from './num-input'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

type ScopeType = 'all' | 'collection' | 'supplier' | 'products'
type Options = { last: { at: string; by: string; summary: string; count: number } | null; collections: Array<{ id: string; name: string; products: number }>; suppliers: Array<{ name: string; products: number }> }
type Picked = { id: string; name: string }

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// Products > Change prices (app/admin/products/prices): pick products, say how to change their
// prices, check every new price, then save. The last change can be undone.
export default function BulkPrices({ currency }: { currency: string }) {
  const confirm = useConfirm()
  const [options, setOptions] = useState<Options | null>(null)
  const [scope, setScope] = useState<ScopeType>('all')
  const [collectionId, setCollectionId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Picked[]>([])
  const [mode, setMode] = useState<PriceMode>('up-percent')
  const [value, setValue] = useState<number | null>(null)
  const [rounding, setRounding] = useState<Rounding>('none')
  const [compareAt, setCompareAt] = useState<CompareAtRule>('keep')
  const [rows, setRows] = useState<PricePreview[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const m = (cents: number) => money(cents, currency)
  const unit = PRICE_MODES.find(x => x.id === mode)?.unit

  const load = () => api('/api/admin/products/prices').then(setOptions).catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  useEffect(() => { load() }, [])
  // Anything changed: the preview no longer matches.
  useEffect(() => { setRows(null) }, [scope, collectionId, supplier, picked, mode, value, rounding, compareAt])
  useEffect(() => {
    const q = query.trim()
    if (scope !== 'products' || q.length < 2) { setFound([]); return }
    const timer = window.setTimeout(() => {
      api(`/api/admin/products?q=${encodeURIComponent(q)}&pageSize=12`).then(d => setFound((d.rows || []).map((p: Picked) => ({ id: p.id, name: p.name })))).catch(() => setFound([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, scope])

  const scopeBody = () => scope === 'collection' ? { type: scope, id: collectionId } : scope === 'supplier' ? { type: scope, name: supplier } : scope === 'products' ? { type: scope, ids: picked.map(p => p.id) } : { type: 'all' }
  const changeBody = () => ({ mode, value: unit === '%' ? value : Math.round((value || 0) * 100), rounding, compareAt })

  async function preview() {
    setBusy(true); setError(''); setMsg('')
    try { setRows((await api('/api/admin/products/prices', { scope: scopeBody(), change: changeBody(), apply: false })).rows) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not work out the prices') } finally { setBusy(false) }
  }

  const changing = useMemo(() => (rows || []).filter(r => r.newPrice !== r.price || r.newCompareAt !== r.compareAt), [rows])
  const belowCost = changing.filter(r => r.belowCost).length
  const problems = (rows || []).filter(r => r.problem).length

  async function apply() {
    if (!(await confirm({ title: `Change ${changing.length} price${changing.length === 1 ? '' : 's'}?`, message: `Customers see the new prices within a minute.${belowCost ? ` ${belowCost} would sell below what you paid.` : ''} You can undo this change afterwards.`, confirmLabel: 'Change prices', tone: 'default' }))) return
    setBusy(true); setError('')
    try {
      const d = await api('/api/admin/products/prices', { scope: scopeBody(), change: changeBody(), apply: true })
      setMsg(`Done. ${d.summary}.`); setRows(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the prices') } finally { setBusy(false) }
  }

  async function undo() {
    if (!options?.last || !(await confirm({ title: 'Undo the last price change?', message: `${options.last.summary}. Prices go back to what they were before. Any price edited by hand since stays as it is.`, confirmLabel: 'Undo', tone: 'default' }))) return
    setBusy(true); setError('')
    try {
      const d = await api('/api/admin/products/prices', { action: 'undo' })
      setMsg(`Undone: ${d.restored} price${d.restored === 1 ? '' : 's'} back as before.${d.skipped ? ` ${d.skipped} edited since were left alone.` : ''}`); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not undo') } finally { setBusy(false) }
  }

  const ready = value != null && value > 0 && (scope !== 'collection' || collectionId) && (scope !== 'supplier' || supplier) && (scope !== 'products' || picked.length > 0)

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/products"><ArrowLeft size={15} /> Products</Link>
    <div>
      <h1 className={s.title}>Change prices</h1>
      <p className={s.subtitle}>Raise or lower many prices at once, for example when the dollar rate or a supplier&apos;s prices change. You see every new price before anything is saved.</p>
    </div>
    {(error || msg) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || msg}</div>}
    {options?.last && <section className={`${ui.card} ${s.card}`}>
      <div className={s.head}><div><strong className={s.name}>Last change</strong><div className={s.meta}><span>{options.last.summary}</span><span>{new Date(options.last.at).toLocaleString()} by {options.last.by}</span></div></div>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={undo} disabled={busy}><RotateCcw size={15} /> Undo</button></div>
    </section>}

    <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>1. Which products</strong>
      <div className={s.chips} role="radiogroup" aria-label="Which products">
        {([['all', 'All products'], ['collection', 'A collection'], ['supplier', 'A supplier'], ['products', 'Choose products']] as Array<[ScopeType, string]>).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={scope === id} className={`${s.chip}${scope === id ? ` ${s.chipOn}` : ''}`} onClick={() => setScope(id)}>{label}</button>)}
      </div>
      {scope === 'collection' && <select className={ui.select} value={collectionId} onChange={e => setCollectionId(e.target.value)} aria-label="Collection"><option value="">Choose a collection</option>{options?.collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.products})</option>)}</select>}
      {scope === 'supplier' && (options?.suppliers.length ? <select className={ui.select} value={supplier} onChange={e => setSupplier(e.target.value)} aria-label="Supplier"><option value="">Choose a supplier</option>{options.suppliers.map(v => <option key={v.name} value={v.name}>{v.name} ({v.products})</option>)}</select>
        : <p className={ui.muted}>No product has a &quot;Vendor / brand&quot; yet.</p>)}
      {scope === 'products' && <div className={s.settings}>
        <label className="inline" style={{ gap: 6 }}><Search size={16} /><input className={ui.input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a product to add" aria-label="Find a product to add" /></label>
        {found.filter(f => !picked.some(p => p.id === f.id)).map(f => <button key={f.id} type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} style={{ justifySelf: 'start' }} onClick={() => setPicked(list => [...list, f])}>+ {f.name}</button>)}
        {picked.length > 0 && <div className={s.chips}>{picked.map(p => <span key={p.id} className={s.chip}>{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicked(list => list.filter(x => x.id !== p.id))} style={{ border: 0, background: 'transparent', cursor: 'pointer', marginInlineStart: 4 }}><X size={14} /></button></span>)}</div>}
      </div>}
    </section>

    <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>2. How</strong>
      <div className={s.chips} role="radiogroup" aria-label="How to change">
        {PRICE_MODES.map(x => <button key={x.id} type="button" role="radio" aria-checked={mode === x.id} className={`${s.chip}${mode === x.id ? ` ${s.chipOn}` : ''}`} onClick={() => setMode(x.id)}>{x.label}</button>)}
      </div>
      <label className={ui.fieldLabel} style={{ maxWidth: 220 }}>{unit === '%' ? 'Percent' : `Amount (${currency})`}
        <NumInput className={ui.input} value={value} decimals onValue={setValue} placeholder={unit === '%' ? '10' : '2.50'} />
      </label>
      <span className={ui.fieldLabel}>Rounding</span>
      <div className={s.chips} role="radiogroup" aria-label="Rounding">
        {([['none', 'No rounding'], ['whole', 'Whole amounts (12.00)'], ['ninety-nine', 'End in .99 (11.99)']] as Array<[Rounding, string]>).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={rounding === id} className={`${s.chip}${rounding === id ? ` ${s.chipOn}` : ''}`} onClick={() => setRounding(id)}>{label}</button>)}
      </div>
      <label className={ui.fieldLabel} style={{ maxWidth: 360 }}>The crossed-out &quot;was&quot; price
        <select className={ui.select} value={compareAt} onChange={e => setCompareAt(e.target.value as CompareAtRule)}>
          <option value="keep">Keep it as it is</option>
          <option value="same">Change it the same way</option>
          <option value="remove">Remove it</option>
        </select>
      </label>
      <div className={s.actions}><button type="button" className={ui.btn} onClick={preview} disabled={busy || !ready}><Eye size={16} /> See the new prices</button></div>
    </section>

    {rows && <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>3. Check and save</strong>
      <p className={ui.muted}>{changing.length} price{changing.length === 1 ? '' : 's'} will change{rows.length > changing.length ? ` (${rows.length - changing.length} stay the same)` : ''}.</p>
      {belowCost > 0 && <div className={`${ui.alert} ${ui.alertDanger}`}><AlertTriangle size={15} /> {belowCost} would sell below what you paid (marked in red).</div>}
      {problems > 0 && <div className={`${ui.alert} ${ui.alertDanger}`}><AlertTriangle size={15} /> {problems} would become zero or less. Change the amount.</div>}
      <div className={ui.tableWrap}><table className={`${ui.table} ${ui.cardTable}`}>
        <thead><tr><th>Product</th><th>Now</th><th>New</th><th>Was price</th></tr></thead>
        <tbody>{rows.slice(0, 300).map(r => <tr key={`${r.kind}-${r.id}`}>
          <td data-cell="primary">{r.name}{r.variant && <div className={ui.muted}>{r.variant}</div>}</td>
          <td data-label="Now">{m(r.price)}</td>
          <td data-label="New"><strong style={{ color: r.belowCost || r.problem ? '#b42318' : undefined }}>{m(r.newPrice)}</strong>{r.belowCost && r.cost != null && <div className={ui.muted}>cost {m(r.cost)}</div>}</td>
          <td data-label="Was price">{r.newCompareAt == null ? (r.compareAt == null ? '' : <del>{m(r.compareAt)}</del>) : m(r.newCompareAt)}</td>
        </tr>)}</tbody>
      </table></div>
      {rows.length > 300 && <p className={ui.muted}>Showing the first 300 of {rows.length}.</p>}
      <div className={s.actions}><button type="button" className={ui.btn} onClick={apply} disabled={busy || !changing.length || problems > 0}><Check size={16} /> Change {changing.length} price{changing.length === 1 ? '' : 's'}</button></div>
    </section>}
  </div>
}

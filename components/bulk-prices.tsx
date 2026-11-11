'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, ArrowLeft, Check, RotateCcw, Search, X } from 'lucide-react'
import { money } from '@/lib/config'
import { PRICE_MODES, changeError, newPrice, type CompareAtRule, type PriceChange, type PriceMode, type PricePreview, type Rounding } from '@/lib/bulk-prices'
import { useConfirm } from './admin-confirm'
import { NumInput } from './num-input'
import s from './bulk-prices.module.css'
import ui from './admin-ui.module.css'

type ScopeType = 'all' | 'collection' | 'supplier' | 'products'
type Options = { last: { at: string; by: string; summary: string; count: number } | null; collections: Array<{ id: string; name: string; products: number }>; suppliers: Array<{ name: string; products: number }> }
type Picked = { id: string; name: string }

const SCOPE_LABELS: Record<ScopeType, string> = { all: 'All products', collection: 'A collection', supplier: 'A supplier', products: 'Chosen products' }
const ROUNDING_LABELS: Record<Rounding, string> = { none: 'Keep exact', whole: 'Whole amounts (12.00)', 'ninety-nine': 'Ending in .99 (11.99)' }
const COMPARE_LABELS: Record<CompareAtRule, string> = { keep: 'Keep it as it is', same: 'Change it the same way', remove: 'Remove it' }
// The product used for the example line under the amount.
const EXAMPLE_CENTS = 2000

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Products > Change prices (app/admin/products/prices). Three steps: which products, the new
// price, then a review of every price that would change. The review updates as you type and
// nothing is saved until the owner confirms. The last change can be undone.
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
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const latest = useRef(0)
  const m = (cents: number) => money(cents, currency)

  const unit = PRICE_MODES.find(x => x.id === mode)?.unit ?? 'money'
  const change: PriceChange = { mode, value: unit === '%' ? (value ?? 0) : Math.round((value ?? 0) * 100), rounding, compareAt }
  const hasAmount = value != null && value > 0
  const amountProblem = hasAmount ? changeError(change) : ''
  const scopeReady = scope === 'all' || (scope === 'collection' && !!collectionId) || (scope === 'supplier' && !!supplier) || (scope === 'products' && picked.length > 0)
  const canPreview = scopeReady && hasAmount && !amountProblem

  const load = () => api('/api/admin/products/prices').then(setOptions).catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  useEffect(() => { load() }, [])

  // Product search for "Chosen products".
  useEffect(() => {
    const q = query.trim()
    if (scope !== 'products' || q.length < 2) { setFound([]); return }
    const timer = window.setTimeout(() => {
      api(`/api/admin/products?q=${encodeURIComponent(q)}&pageSize=12`).then(d => setFound((d.rows || []).map((p: Picked) => ({ id: p.id, name: p.name })))).catch(() => setFound([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, scope])

  // The review: asked for after a short pause, once the form is complete. A reply that arrives
  // after the form has changed again is ignored.
  useEffect(() => {
    latest.current += 1
    const id = latest.current
    setRows(null)
    setError('')
    if (!canPreview) { setPreviewing(false); return }
    setPreviewing(true)
    const scopeBody = scope === 'collection' ? { type: scope, id: collectionId } : scope === 'supplier' ? { type: scope, name: supplier } : scope === 'products' ? { type: scope, ids: picked.map(p => p.id) } : { type: 'all' }
    const timer = window.setTimeout(() => {
      api('/api/admin/products/prices', { scope: scopeBody, change, apply: false })
        .then(d => { if (id === latest.current) setRows(d.rows) })
        .catch(e => { if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not work out the prices') })
        .finally(() => { if (id === latest.current) setPreviewing(false) })
    }, 350)
    return () => window.clearTimeout(timer)
    // `change` is rebuilt from the state listed here on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreview, scope, collectionId, supplier, picked, mode, value, rounding, compareAt])

  const changing = useMemo(() => (rows || []).filter(r => r.newPrice !== r.price || r.newCompareAt !== r.compareAt), [rows])
  const belowCost = changing.filter(r => r.belowCost).length
  const problems = (rows || []).filter(r => r.problem).length

  async function apply() {
    const count = changing.length
    if (!(await confirm({ title: `Change ${plural(count, 'price')}?`, message: `Customers see the new prices within a minute.${belowCost ? ` ${belowCost} would sell below what you paid.` : ''} You can undo this change afterwards.`, confirmLabel: 'Change prices', tone: 'default' }))) return
    setBusy(true); setError('')
    try {
      const scopeBody = scope === 'collection' ? { type: scope, id: collectionId } : scope === 'supplier' ? { type: scope, name: supplier } : scope === 'products' ? { type: scope, ids: picked.map(p => p.id) } : { type: 'all' }
      const d = await api('/api/admin/products/prices', { scope: scopeBody, change, apply: true })
      setMsg(`Done. ${d.summary}.`)
      // Clear the amount: the same change would otherwise be offered again on top of the new prices.
      setValue(null)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the prices') } finally { setBusy(false) }
  }

  async function undo() {
    if (!options?.last || !(await confirm({ title: 'Undo the last price change?', message: `${options.last.summary}. Prices go back to what they were before. Any price edited by hand since stays as it is.`, confirmLabel: 'Undo', tone: 'default' }))) return
    setBusy(true); setError('')
    try {
      const d = await api('/api/admin/products/prices', { action: 'undo' })
      setMsg(`Undone: ${plural(d.restored, 'price')} back as before.${d.skipped ? ` ${d.skipped} edited since ${d.skipped === 1 ? 'was' : 'were'} left alone.` : ''}`)
      setValue(null)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not undo') } finally { setBusy(false) }
  }

  const example = hasAmount && !amountProblem ? newPrice(EXAMPLE_CENTS, change) : null
  const blocked = problems > 0 ? 'Change the amount first: some prices would become zero or less.' : !changing.length && rows ? 'No price would change with these choices.' : ''

  return <div className={s.page}>
    <Link className={ui.textLink} href="/admin/products"><ArrowLeft size={15} /> Products</Link>

    <header className={s.header}>
      <h1 className={s.title}>Change prices</h1>
      <p className={s.subtitle}>Change many prices at once. Nothing is saved until you confirm.</p>
    </header>

    {msg && <div className={ui.alert} role="status">{msg}</div>}
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}

    {options?.last && <div className={s.lastChange}>
      <div className={s.lastText}>
        <span className={ui.muted}>Last change</span>
        <strong>{options.last.summary}</strong>
        <span className={ui.muted}>{new Date(options.last.at).toLocaleString()} by {options.last.by}</span>
      </div>
      <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={undo} disabled={busy}><RotateCcw size={15} /> Undo</button>
    </div>}

    <section className={`${ui.card} ${s.step}`} aria-labelledby="prices-step-1">
      <div className={s.stepHead}><span className={s.stepNum}>1</span><h2 id="prices-step-1" className={s.stepTitle}>Which products</h2></div>
      <div className={s.fields}>
        <label className={s.field}>
          <span className={ui.fieldLabel}>Products</span>
          <select className={ui.select} value={scope} onChange={e => setScope(e.target.value as ScopeType)}>
            {(Object.keys(SCOPE_LABELS) as ScopeType[]).map(id => <option key={id} value={id}>{SCOPE_LABELS[id]}</option>)}
          </select>
        </label>
        {scope === 'collection' && <label className={s.field}>
          <span className={ui.fieldLabel}>Collection</span>
          <select className={ui.select} value={collectionId} onChange={e => setCollectionId(e.target.value)}>
            <option value="">Choose a collection</option>
            {options?.collections.map(c => <option key={c.id} value={c.id}>{c.name} ({plural(c.products, 'product')})</option>)}
          </select>
        </label>}
        {scope === 'supplier' && <div className={s.field}>
          <span className={ui.fieldLabel}>Supplier or brand</span>
          {options?.suppliers.length
            ? <select className={ui.select} value={supplier} onChange={e => setSupplier(e.target.value)}>
              <option value="">Choose a supplier</option>
              {options.suppliers.map(v => <option key={v.name} value={v.name}>{v.name} ({plural(v.products, 'product')})</option>)}
            </select>
            : <p className={ui.muted}>No product has a brand or vendor yet.</p>}
        </div>}
      </div>
      {scope === 'products' && <div className={s.picker}>
        <label className={s.search}>
          <Search size={15} aria-hidden="true" />
          <input className={ui.input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for a product" aria-label="Search for a product" />
        </label>
        {found.filter(f => !picked.some(p => p.id === f.id)).length > 0 && <ul className={s.found}>
          {found.filter(f => !picked.some(p => p.id === f.id)).map(f => <li key={f.id}><button type="button" className={s.foundBtn} onClick={() => { setPicked(list => [...list, f]); setQuery('') }}>{f.name}</button></li>)}
        </ul>}
        {picked.length > 0 && <div className={s.chips}>
          {picked.map(p => <span key={p.id} className={s.chip}>{p.name}<button type="button" className={s.chipRemove} aria-label={`Remove ${p.name}`} onClick={() => setPicked(list => list.filter(x => x.id !== p.id))}><X size={13} /></button></span>)}
        </div>}
      </div>}
    </section>

    <section className={`${ui.card} ${s.step}`} aria-labelledby="prices-step-2">
      <div className={s.stepHead}><span className={s.stepNum}>2</span><h2 id="prices-step-2" className={s.stepTitle}>New price</h2></div>
      <div className={s.fields}>
        <label className={s.field}>
          <span className={ui.fieldLabel}>Change</span>
          <select className={ui.select} value={mode} onChange={e => setMode(e.target.value as PriceMode)}>
            {PRICE_MODES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <label className={s.field}>
          <span className={ui.fieldLabel}>{unit === '%' ? 'Percent' : `Amount (${currency})`}</span>
          <NumInput className={ui.input} value={value} decimals onValue={setValue} placeholder={unit === '%' ? '10' : '2.50'} aria-invalid={!!amountProblem} aria-describedby="prices-amount-note" />
        </label>
        <label className={s.field}>
          <span className={ui.fieldLabel}>Round the new prices</span>
          <select className={ui.select} value={rounding} onChange={e => setRounding(e.target.value as Rounding)}>
            {(Object.keys(ROUNDING_LABELS) as Rounding[]).map(id => <option key={id} value={id}>{ROUNDING_LABELS[id]}</option>)}
          </select>
        </label>
      </div>
      <p id="prices-amount-note" className={amountProblem ? s.problem : s.example} role={amountProblem ? 'alert' : undefined}>
        {amountProblem || (example != null
          ? <>Example: a product at {m(EXAMPLE_CENTS)} changes to <strong>{m(example)}</strong>.</>
          : 'Type an amount to see an example.')}
      </p>
      <details className={s.details}>
        <summary>Crossed-out &ldquo;was&rdquo; price</summary>
        <div className={s.fields}>
          <label className={s.field}>
            <span className={ui.fieldLabel}>Products that show one</span>
            <select className={ui.select} value={compareAt} onChange={e => setCompareAt(e.target.value as CompareAtRule)}>
              {(Object.keys(COMPARE_LABELS) as CompareAtRule[]).map(id => <option key={id} value={id}>{COMPARE_LABELS[id]}</option>)}
            </select>
          </label>
        </div>
        <p className={ui.fieldHelp}>The crossed-out price shows next to the new price on the store.</p>
      </details>
    </section>

    <section className={`${ui.card} ${s.step}`} aria-labelledby="prices-step-3">
      <div className={s.stepHead}><span className={s.stepNum}>3</span><h2 id="prices-step-3" className={s.stepTitle}>Review and confirm</h2></div>

      {!canPreview && <p className={ui.muted}>Choose products and an amount to see the new prices.</p>}
      {canPreview && previewing && <p className={ui.muted} role="status">Working out the new prices…</p>}

      {canPreview && rows && <>
        <div className={s.summary} aria-live="polite">
          <span className={`${s.pill} ${changing.length ? s.pillOn : ''}`}>{plural(changing.length, 'price')} to change</span>
          {rows.length > changing.length && <span className={s.pill}>{rows.length - changing.length} stay the same</span>}
          {belowCost > 0 && <span className={`${s.pill} ${s.pillDanger}`}><AlertTriangle size={13} /> {belowCost} below cost</span>}
          {problems > 0 && <span className={`${s.pill} ${s.pillDanger}`}><AlertTriangle size={13} /> {problems} zero or less</span>}
        </div>
        {belowCost > 0 && <p className={s.note}>Prices in red sell for less than they cost you. Check them before you confirm.</p>}

        <div className={ui.tableWrap}>
          <table className={`${ui.table} ${ui.cardTable}`}>
            <thead><tr><th>Product</th><th>Now</th><th>New</th><th>Change</th><th>Crossed-out price</th></tr></thead>
            <tbody>{rows.slice(0, 300).map(r => {
              const delta = r.price > 0 ? Math.round(((r.newPrice - r.price) / r.price) * 100) : 0
              return <tr key={`${r.kind}-${r.id}`}>
                <td data-cell="primary">{r.name}{r.variant && <div className={ui.muted}>{r.variant}</div>}</td>
                <td data-label="Now">{m(r.price)}</td>
                <td data-label="New" className={r.belowCost || r.problem ? s.below : undefined}><strong>{m(r.newPrice)}</strong>{r.belowCost && r.cost != null && <div className={s.costNote}>cost {m(r.cost)}</div>}</td>
                <td data-label="Change" className={s.delta}>{r.newPrice === r.price ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}</td>
                <td data-label="Crossed-out price">{r.newCompareAt == null ? (r.compareAt == null ? '—' : <del>{m(r.compareAt)}</del>) : m(r.newCompareAt)}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {rows.length > 300 && <p className={ui.fieldHelp}>Showing the first 300 of {rows.length}.</p>}

        <div className={s.footer}>
          <span className={blocked ? s.blocked : s.hint}>{blocked || 'Customers see the new prices within a minute.'}</span>
          <button type="button" className={ui.btn} onClick={apply} disabled={busy || !changing.length || problems > 0}>
            <Check size={16} /> {changing.length ? `Change ${plural(changing.length, 'price')}` : 'Change prices'}
          </button>
        </div>
      </>}
    </section>
  </div>
}

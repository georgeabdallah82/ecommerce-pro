'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Gift, Layers, Percent, Plus, Search, ShieldCheck, Tag, X } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-coupons.module.css'
import ui from './admin-ui.module.css'

type Scope = 'ALL_PRODUCTS' | 'SPECIFIC_PRODUCTS' | 'SPECIFIC_COLLECTIONS'

type Coupon = {
  id: string
  code: string
  isAutomatic: boolean
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BUY_X_GET_Y'
  value: number
  minSubtotal: number | null
  maxUses: number | null
  usedCount: number
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  firstOrderOnly: boolean
  appliesTo?: Scope
  productIds?: string[]
  collectionIds?: string[]
  buyQuantity?: number | null
  getQuantity?: number | null
  getDiscountPercent?: number | null
  getAppliesTo?: Scope | null
  getProductIds?: string[]
  getCollectionIds?: string[]
}

type CatalogProduct = { id: string; name: string; sku?: string | null }
type CatalogCollection = { id: string; name: string }

const EXPIRING_WINDOW_MS = 7 * 86400000
const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'ALL_PRODUCTS', label: 'All products' },
  { value: 'SPECIFIC_PRODUCTS', label: 'Specific products' },
  { value: 'SPECIFIC_COLLECTIONS', label: 'Specific collections' },
]

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

function label(type: Coupon['type']) {
  return type === 'PERCENTAGE' ? 'Percentage' : type === 'FIXED' ? 'Fixed amount' : type === 'BUY_X_GET_Y' ? 'Buy X Get Y' : 'Free shipping'
}

function valueLabel(c: Coupon) {
  if (c.type === 'PERCENTAGE') return `${c.value}%`
  if (c.type === 'FIXED') return money(c.value)
  if (c.type === 'BUY_X_GET_Y') return `Buy ${c.buyQuantity || 1}, get ${c.getQuantity || 1} at ${c.getDiscountPercent ?? 100}% off`
  return 'Free shipping'
}

function scopeSummary(scope: Scope | null | undefined, productIds: string[] | undefined, collectionIds: string[] | undefined) {
  if (scope === 'SPECIFIC_PRODUCTS') return `${productIds?.length || 0} product${productIds?.length === 1 ? '' : 's'}`
  if (scope === 'SPECIFIC_COLLECTIONS') return `${collectionIds?.length || 0} collection${collectionIds?.length === 1 ? '' : 's'}`
  return 'All products'
}

function isExpiringSoon(c: Coupon, now: number) {
  if (!c.expiresAt) return false
  const at = new Date(c.expiresAt).getTime()
  return at > now && at < now + EXPIRING_WINDOW_MS
}

/**
 * Module-scope, not nested in the page component -- a component declared
 * inside another component's render body gets a fresh identity every render,
 * which makes React remount its whole subtree (and drop focus) on every
 * keystroke elsewhere on the page. Bit the admin twice already this project.
 */
function ScopePicker({
  title, hint, scope, productIds, collectionIds, products, collections, onScope, onProductIds, onCollectionIds,
}: {
  title: string
  hint?: string
  scope: Scope
  productIds: string[]
  collectionIds: string[]
  products: CatalogProduct[]
  collections: CatalogCollection[]
  onScope: (scope: Scope) => void
  onProductIds: (ids: string[]) => void
  onCollectionIds: (ids: string[]) => void
}) {
  return <div className={styles.scopeBlock}>
    <div>
      <label className={ui.fieldLabel}>{title}</label>
      {hint && <span className={ui.fieldHelp}>{hint}</span>}
    </div>
    <div className={styles.scopeButtons}>
      {SCOPE_OPTIONS.map(opt => (
        <button key={opt.value} type="button" className={`${styles.scopeBtn} ${scope === opt.value ? styles.active : ''}`} onClick={() => onScope(opt.value)}>{opt.label}</button>
      ))}
    </div>
    {scope === 'SPECIFIC_PRODUCTS' && <div className={styles.scopeList}>
      {products.map(p => <label key={p.id}>
        <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => onProductIds(productIds.includes(p.id) ? productIds.filter(x => x !== p.id) : [...productIds, p.id])} />
        {p.name}{p.sku && <small> · {p.sku}</small>}
      </label>)}
      {!products.length && <span className={ui.muted}>No products found.</span>}
    </div>}
    {scope === 'SPECIFIC_COLLECTIONS' && <div className={styles.scopeList}>
      {collections.map(c => <label key={c.id}>
        <input type="checkbox" checked={collectionIds.includes(c.id)} onChange={() => onCollectionIds(collectionIds.includes(c.id) ? collectionIds.filter(x => x !== c.id) : [...collectionIds, c.id])} />
        {c.name}
      </label>)}
      {!collections.length && <span className={ui.muted}>No collections found.</span>}
    </div>}
  </div>
}

const emptyForm = {
  code: '', isAutomatic: false, type: 'PERCENTAGE' as Coupon['type'], value: '10',
  minSubtotal: '', maxUses: '', startsAt: '', expiresAt: '', firstOrderOnly: false,
  appliesTo: 'ALL_PRODUCTS' as Scope, productIds: [] as string[], collectionIds: [] as string[],
  buyQuantity: '1', getQuantity: '1', getDiscountPercent: '100',
  getAppliesTo: 'ALL_PRODUCTS' as Scope, getProductIds: [] as string[], getCollectionIds: [] as string[],
}

export default function CouponsAdminPro({ initial }: { initial: Coupon[] }) {
  const [rows, setRows] = useState<Coupon[]>(initial || [])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRING'>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [catalog, setCatalog] = useState<{ products: CatalogProduct[]; collections: CatalogCollection[] } | null>(null)

  useEffect(() => {
    if (!formOpen || catalog) return
    Promise.all([
      api('/api/admin/products?page=1&pageSize=200&sort=name_asc'),
      api('/api/admin/collections'),
    ]).then(([p, c]) => setCatalog({
      products: (p.rows || []).map((x: any) => ({ id: x.id, name: x.name, sku: x.sku })),
      collections: (Array.isArray(c) ? c : []).map((x: any) => ({ id: x.id, name: x.name })),
    })).catch(() => setCatalog({ products: [], collections: [] }))
  }, [formOpen, catalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = Date.now()
    return rows.filter(c => {
      const matchesQuery = !q || `${c.code} ${label(c.type)}`.toLowerCase().includes(q)
      const matchesStatus = status === 'ALL' ? true
        : status === 'ACTIVE' ? c.isActive
        : status === 'INACTIVE' ? !c.isActive
        : isExpiringSoon(c, now)
      return matchesQuery && matchesStatus
    })
  }, [rows, query, status])

  const stats = useMemo(() => {
    const now = Date.now()
    return {
      total: rows.length,
      active: rows.filter(x => x.isActive).length,
      used: rows.reduce((s, x) => s + x.usedCount, 0),
      expiring: rows.filter(x => isExpiringSoon(x, now)).length,
    }
  }, [rows])

  async function refresh() {
    setRows(await api('/api/admin/coupons'))
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const type = form.type
      const valueNumber = Number(form.value)
      if (type === 'PERCENTAGE' && (valueNumber <= 0 || valueNumber > 100)) throw new Error('Percentage must be between 1 and 100.')
      if (type === 'FIXED' && valueNumber < 0) throw new Error('Discount value cannot be negative.')
      if (type === 'BUY_X_GET_Y' && (Number(form.buyQuantity) < 1 || Number(form.getQuantity) < 1)) throw new Error('Buy and get quantities must be at least 1.')
      const data = await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify({
        code: form.code,
        isAutomatic: form.isAutomatic,
        type,
        value: type === 'PERCENTAGE' ? Math.round(valueNumber) : type === 'FIXED' ? Math.round(valueNumber * 100) : 0,
        minSubtotal: form.minSubtotal ? Math.round(Number(form.minSubtotal) * 100) : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        firstOrderOnly: form.firstOrderOnly,
        appliesTo: form.appliesTo,
        productIds: form.productIds,
        collectionIds: form.collectionIds,
        ...(type === 'BUY_X_GET_Y' ? {
          buyQuantity: Number(form.buyQuantity),
          getQuantity: Number(form.getQuantity),
          getDiscountPercent: Number(form.getDiscountPercent),
          getAppliesTo: form.getAppliesTo,
          getProductIds: form.getProductIds,
          getCollectionIds: form.getCollectionIds,
        } : {}),
      }) })
      setRows(current => [data.coupon, ...current])
      setForm(emptyForm)
      setFormOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create discount') }
    finally { setSaving(false) }
  }

  async function toggle(c: Coupon) {
    setError('')
    try {
      const data = await api('/api/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, isActive: !c.isActive }) })
      setRows(current => current.map(x => x.id === c.id ? data.coupon : x))
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update discount') }
  }

  async function copyCode(code: string) {
    await navigator.clipboard?.writeText(code)
    setCopied(code)
    window.setTimeout(() => setCopied(''), 1300)
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><span className={ui.muted}>GROWTH</span><h1 className={ui.heading}>Discounts</h1><p className={ui.muted}>Create and manage discount codes with clear rules and usage control.</p></div>
      <button className={ui.btn} onClick={() => setFormOpen(true)}><Plus size={16}/> Create discount</button>
    </div>

    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}

    <div className="catalogStats">
      <button className={`statCard ${status === 'ALL' ? 'active' : ''}`} onClick={() => setStatus('ALL')}><span>Total discounts</span><strong>{stats.total}</strong></button>
      <button className={`statCard ${status === 'ACTIVE' ? 'active' : ''}`} onClick={() => setStatus('ACTIVE')}><span>Active</span><strong>{stats.active}</strong></button>
      <div className="statCard" style={{ cursor: 'default' }}><span>Redemptions</span><strong>{stats.used}</strong></div>
      <button className={`statCard ${status === 'EXPIRING' ? 'active' : ''}`} onClick={() => setStatus('EXPIRING')}><span>Ending soon</span><strong>{stats.expiring}</strong></button>
    </div>

    <div className={`${ui.card} catalogToolbar`}>
      <div className="productSearch"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search discount codes…"/><button className="searchClear" hidden={!query} onClick={() => setQuery('')}><X size={14}/></button></div>
      <select className={ui.input} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        <option value="ALL">All discounts</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
        <option value="EXPIRING">Ending soon</option>
      </select>
      <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={refresh}>Refresh</button>
    </div>

    <div className={`${ui.card} productTableCard`}>
      <div className={styles.tableTopline}><span className={ui.muted}>{filtered.length} discount{filtered.length === 1 ? '' : 's'}</span><span className={ui.muted}>Codes are case-insensitive</span></div>
      <div className={ui.tableWrap}><table className={`${ui.table} productTable`}><thead><tr><th>Discount</th><th>Type</th><th>Value</th><th>Applies to</th><th>Usage</th><th>Schedule</th><th>Status</th><th></th></tr></thead><tbody>
        {filtered.map(c => <tr key={c.id}>
          <td><div className="inline"><div className={styles.discountIcon}><Tag size={18}/></div><div><strong>{c.code}</strong>{c.isAutomatic && <span className={ui.statusPill} style={{ marginLeft: 8 }}>Automatic</span>}<div className={ui.muted}>{c.firstOrderOnly ? 'First order only' : 'Available to all customers'}</div></div></div></td>
          <td>{label(c.type)}</td><td><strong>{valueLabel(c)}</strong>{c.minSubtotal ? <div className={ui.muted}>Min {money(c.minSubtotal)}</div> : null}</td>
          <td>{scopeSummary(c.appliesTo, c.productIds, c.collectionIds)}</td>
          <td>{c.usedCount}{c.maxUses ? <span className={ui.muted}> / {c.maxUses}</span> : <span className={ui.muted}> / unlimited</span>}</td>
          <td>{c.expiresAt ? <span>{new Date(c.expiresAt).toLocaleDateString()}</span> : <span className={ui.muted}>No expiry</span>}</td>
          <td><span className={`${ui.statusPill} ${c.isActive ? ui.statusPillSuccess : ui.statusPillWarning}`}>{c.isActive ? <><Check size={13}/> Active</> : 'Inactive'}</span></td>
          <td><div className="inline"><button className={ui.iconBtn} title="Copy code" onClick={() => copyCode(c.code)}>{copied === c.code ? <Check size={15}/> : <Copy size={15}/>}</button><button className={ui.textButton} onClick={() => toggle(c)}>{c.isActive ? 'Disable' : 'Enable'}</button></div></td>
        </tr>)}
      </tbody></table></div>
      {!filtered.length && <div className={ui.empty}><Gift size={28}/><h3>No discounts found</h3><p className={ui.muted}>Try a different search or create a new discount.</p></div>}
    </div>

    {formOpen && <div className={ui.modalOverlay} onClick={() => !saving && setFormOpen(false)}><div className={`${ui.card} ${styles.modal}`} onClick={e => e.stopPropagation()}>
      <div className="inventoryModalHead"><div><span className={`${ui.muted} ${ui.tiny}`}>CREATE DISCOUNT</span><h2>New discount</h2><p className={ui.muted}>Set the code, value and eligibility rules.</p></div><button className={ui.iconBtn} onClick={() => setFormOpen(false)} disabled={saving}><X size={17}/></button></div>
      <form onSubmit={createCoupon} className={styles.form}>
        <div className={styles.codeRow}><label className={ui.fieldLabel}>Discount code<input className={ui.input} required value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase().replace(/\s+/g, '-').slice(0, 64)})} placeholder="SUMMER10"/></label><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setForm({...form, code: `SAVE${Math.floor(1000 + Math.random()*9000)}`})}>Generate</button></div>
        <label className={styles.toggleRow}><input type="checkbox" checked={form.isAutomatic} onChange={e => setForm({...form, isAutomatic: e.target.checked})}/><span><strong>Apply automatically</strong><small>Customers get this discount at checkout without entering the code above. Only applies when they haven't entered a different code.</small></span></label>
        <div className={styles.typeGrid}>
          <button type="button" className={`${styles.typeCard} ${form.type === 'PERCENTAGE' ? styles.active : ''}`} onClick={() => setForm({...form, type: 'PERCENTAGE'})}><Percent size={17}/><strong>Percentage</strong><span>10% off</span></button>
          <button type="button" className={`${styles.typeCard} ${form.type === 'FIXED' ? styles.active : ''}`} onClick={() => setForm({...form, type: 'FIXED'})}><Tag size={17}/><strong>Fixed amount</strong><span>$10 off</span></button>
          <button type="button" className={`${styles.typeCard} ${form.type === 'FREE_SHIPPING' ? styles.active : ''}`} onClick={() => setForm({...form, type: 'FREE_SHIPPING', value: '0'})}><Gift size={17}/><strong>Free shipping</strong><span>Remove shipping charge</span></button>
          <button type="button" className={`${styles.typeCard} ${form.type === 'BUY_X_GET_Y' ? styles.active : ''}`} onClick={() => setForm({...form, type: 'BUY_X_GET_Y', value: '0'})}><Layers size={17}/><strong>Buy X Get Y</strong><span>Reward larger carts</span></button>
        </div>
        {form.type !== 'FREE_SHIPPING' && form.type !== 'BUY_X_GET_Y' && <label className={ui.fieldLabel}>Value{form.type === 'PERCENTAGE' && <span className={ui.fieldHelp} style={{ display: 'inline', marginLeft: 6 }}>(whole percent)</span>}<input className={ui.input} required type="number" min="0" step={form.type === 'PERCENTAGE' ? '1' : '0.01'} max={form.type === 'PERCENTAGE' ? 100 : undefined} value={form.value} onChange={e => setForm({...form, value: e.target.value})}/></label>}

        {form.type === 'BUY_X_GET_Y' && <>
          <div className={styles.bxgyGrid}>
            <label className={ui.fieldLabel}>Buy quantity<input className={ui.input} required type="number" min="1" step="1" value={form.buyQuantity} onChange={e => setForm({...form, buyQuantity: e.target.value})}/></label>
            <label className={ui.fieldLabel}>Get quantity<input className={ui.input} required type="number" min="1" step="1" value={form.getQuantity} onChange={e => setForm({...form, getQuantity: e.target.value})}/></label>
            <label className={ui.fieldLabel}>Get discount<span className={ui.fieldHelp} style={{ display: 'inline', marginLeft: 6 }}>(100 = free)</span><input className={ui.input} required type="number" min="0" max="100" step="1" value={form.getDiscountPercent} onChange={e => setForm({...form, getDiscountPercent: e.target.value})}/></label>
          </div>
        </>}

        <ScopePicker
          title={form.type === 'BUY_X_GET_Y' ? 'Customer buys' : 'Applies to'}
          hint={form.type === 'BUY_X_GET_Y' ? 'Which items count toward the buy quantity above.' : 'Limit this discount to specific products or collections instead of the whole order.'}
          scope={form.appliesTo}
          productIds={form.productIds}
          collectionIds={form.collectionIds}
          products={catalog?.products || []}
          collections={catalog?.collections || []}
          onScope={value => setForm({...form, appliesTo: value})}
          onProductIds={value => setForm({...form, productIds: value})}
          onCollectionIds={value => setForm({...form, collectionIds: value})}
        />

        {form.type === 'BUY_X_GET_Y' && <ScopePicker
          title="Customer gets"
          hint="Which items the discount applies to. Defaults to the same items as above."
          scope={form.getAppliesTo}
          productIds={form.getProductIds}
          collectionIds={form.getCollectionIds}
          products={catalog?.products || []}
          collections={catalog?.collections || []}
          onScope={value => setForm({...form, getAppliesTo: value})}
          onProductIds={value => setForm({...form, getProductIds: value})}
          onCollectionIds={value => setForm({...form, getCollectionIds: value})}
        />}

        <div className={styles.formGrid}><label className={ui.fieldLabel}>Minimum order<input className={ui.input} type="number" min="0" step="0.01" value={form.minSubtotal} onChange={e => setForm({...form, minSubtotal: e.target.value})} placeholder="None"/></label><label className={ui.fieldLabel}>Maximum uses<input className={ui.input} type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm({...form, maxUses: e.target.value})} placeholder="Unlimited"/></label><label className={ui.fieldLabel}>Starts<input className={ui.input} type="datetime-local" value={form.startsAt} onChange={e => setForm({...form, startsAt: e.target.value})}/></label><label className={ui.fieldLabel}>Ends<input className={ui.input} type="datetime-local" value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})}/></label></div>
        <label className={styles.toggleRow}><input type="checkbox" checked={form.firstOrderOnly} onChange={e => setForm({...form, firstOrderOnly: e.target.checked})}/><span><strong>First order only</strong><small>Limit this discount to customers with no previous completed order.</small></span></label>
        <div className={`inline ${styles.formFooter}`}><div className="inline"><ShieldCheck size={15}/><span className={ui.muted}>Validated again at checkout</span></div><div className="inline"><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button><button className={ui.btn} disabled={saving}>{saving ? 'Creating…' : 'Create discount'}</button></div></div>
      </form>
    </div></div>}
  </div>
}

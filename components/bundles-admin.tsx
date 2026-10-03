'use client'

import { useMemo, useState } from 'react'
import { PackagePlus, Plus, Trash2, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import styles from './admin-bundles.module.css'
import { useConfirm } from './admin-confirm'
import { NumInput } from './num-input'

type Variant = { id: string; name: string; price: number | null }
type Product = { id: string; name: string; basePrice: number; status: string; variants: Variant[] }
type Item = { productId: string; variantId: string | null; quantity: number }
type Bundle = { id: string; name: string; description: string; active: boolean; price: number; items: Item[] }
type Config = { enabled: boolean; bundles: Bundle[] }

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const fmt = (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`

export default function BundlesAdmin({ initial, products, currency, canManage }: { initial: Config; products: Product[]; currency: string; canManage: boolean }) {
  const confirm = useConfirm()
  const [config, setConfig] = useState<Config>(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Prices are typed in dollars; kept as text while editing so "4." doesn't jump.
  const [priceText, setPriceText] = useState<Record<string, string>>(() => Object.fromEntries(initial.bundles.map(b => [b.id, (b.price / 100).toFixed(2)])))
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const dirty = JSON.stringify(config) !== saved

  const unitPrice = (item: Item) => {
    const p = byId.get(item.productId)
    if (!p) return null
    if (item.variantId) { const v = p.variants.find(x => x.id === item.variantId); return v ? (v.price ?? p.basePrice) : null }
    return p.basePrice
  }
  const fullPrice = (b: Bundle) => b.items.reduce((sum, it) => sum + (unitPrice(it) ?? 0) * it.quantity, 0)
  const patch = (id: string, next: Partial<Bundle>) => setConfig(c => ({ ...c, bundles: c.bundles.map(b => b.id === id ? { ...b, ...next } : b) }))
  const patchItem = (id: string, index: number, next: Partial<Item>) => setConfig(c => ({ ...c, bundles: c.bundles.map(b => b.id === id ? { ...b, items: b.items.map((it, i) => i === index ? { ...it, ...next } : it) } : b) }))

  function addBundle() {
    const id = newId()
    setConfig(c => ({ ...c, bundles: [...c.bundles, { id, name: 'New bundle', description: '', active: true, price: 0, items: [] }] }))
    setPriceText(t => ({ ...t, [id]: '' }))
  }
  async function removeBundle(b: Bundle) {
    if (!(await confirm({ title: `Delete "${b.name}"?`, message: 'Shoppers who already have it in their cart pay the normal price for the items.', confirmLabel: 'Delete bundle' }))) return
    setConfig(c => ({ ...c, bundles: c.bundles.filter(x => x.id !== b.id) }))
  }
  function addItem(b: Bundle) {
    const first = products.find(p => !b.items.some(it => it.productId === p.id))
    if (!first) return
    patch(b.id, { items: [...b.items, { productId: first.id, variantId: first.variants[0]?.id || null, quantity: 1 }] })
  }

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/admin/bundles', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save bundles right now.')
      setConfig(data); setSaved(JSON.stringify(data))
      setNotice(data.enabled ? 'Saved. Active bundles show on your store.' : 'Saved. Bundles are switched off, so shoppers do not see them.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save bundles right now.') }
    finally { setBusy(false) }
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>MARKETING</span><h1 className={ui.heading}>Bundles</h1><p className={ui.muted}>Sell a set of products together for one lower price (&ldquo;Bundle &amp; save&rdquo;).</p></div>
      {canManage && <div className="inline">
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addBundle}><Plus size={15} /> New bundle</button>
        <button className={ui.btn} onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
      </div>}
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

    <div className={`${ui.card} ${styles.switchCard}`}>
      <div>
        <strong>Show bundles on my store</strong>
        <p className={ui.muted}>{config.enabled ? 'On: active bundles appear in the “Bundle & save” homepage section (add it in the theme editor) and get the bundle price at checkout.' : 'Off: nothing about bundles shows on the store, and checkout charges the normal price.'}</p>
      </div>
      <button type="button" role="switch" aria-checked={config.enabled} aria-label="Show bundles on my store" disabled={!canManage} className={`${styles.switch} ${config.enabled ? styles.on : ''}`} onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}><i /></button>
    </div>

    {!config.bundles.length && <div className={`${ui.card} ${ui.empty}`}><PackagePlus size={28} /><h3>No bundles yet</h3><p className={ui.muted}>Create one, e.g. &ldquo;Cleaning starter set&rdquo;: three products for less than buying them one by one.</p>{canManage && <button className={ui.btn} onClick={addBundle}><Plus size={15} /> New bundle</button>}</div>}

    {config.bundles.map(b => {
      const full = fullPrice(b)
      const saving = full - b.price
      return <div className={`${ui.card} ${styles.bundle}`} key={b.id}>
        <div className={styles.bundleHead}>
          <label className={styles.grow}><span className={ui.fieldLabel}>Name</span><input className={ui.input} value={b.name} maxLength={120} disabled={!canManage} onChange={e => patch(b.id, { name: e.target.value })} /></label>
          <label><span className={ui.fieldLabel}>Bundle price ({currency})</span><input className={ui.input} inputMode="decimal" value={priceText[b.id] ?? ''} disabled={!canManage} placeholder="0.00" onChange={e => { const v = e.target.value; setPriceText(t => ({ ...t, [b.id]: v })); const n = Number(v); if (Number.isFinite(n) && n >= 0) patch(b.id, { price: Math.round(n * 100) }) }} /></label>
          <label className={styles.check}><input type="checkbox" checked={b.active} disabled={!canManage} onChange={e => patch(b.id, { active: e.target.checked })} /> Active</label>
          {canManage && <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} aria-label={`Delete ${b.name}`} onClick={() => removeBundle(b)}><Trash2 size={15} /></button>}
        </div>
        <label><span className={ui.fieldLabel}>Short description (optional)</span><input className={ui.input} value={b.description} maxLength={300} disabled={!canManage} onChange={e => patch(b.id, { description: e.target.value })} /></label>

        <div className={styles.items}>
          <span className={ui.fieldLabel}>Products in this bundle</span>
          {b.items.map((it, i) => {
            const p = byId.get(it.productId)
            return <div className={styles.item} key={i}>
              <select className={ui.input} value={it.productId} disabled={!canManage} onChange={e => { const np = byId.get(e.target.value); patchItem(b.id, i, { productId: e.target.value, variantId: np?.variants[0]?.id || null }) }} aria-label="Product">
                {!p && <option value={it.productId}>Deleted product</option>}
                {products.map(x => <option key={x.id} value={x.id}>{x.name}{x.status !== 'ACTIVE' ? ' (not active)' : ''}</option>)}
              </select>
              {p && p.variants.length > 0 && <select className={ui.input} value={it.variantId || ''} disabled={!canManage} onChange={e => patchItem(b.id, i, { variantId: e.target.value || null })} aria-label="Option">
                {p.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>}
              <NumInput className={`${ui.input} ${styles.qty}`} value={it.quantity} disabled={!canManage} onValue={n => patchItem(b.id, i, { quantity: Math.min(20, Math.max(1, Math.floor(Number(n) || 1))) })} aria-label="Quantity" />
              <span className={ui.muted}>{unitPrice(it) !== null ? fmt((unitPrice(it) || 0) * it.quantity, currency) : 'Unavailable'}</span>
              {canManage && <button type="button" className={ui.iconBtn} aria-label="Remove product" onClick={() => patch(b.id, { items: b.items.filter((_, j) => j !== i) })}><X size={14} /></button>}
            </div>
          })}
          {canManage && b.items.length < 6 && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => addItem(b)} disabled={!products.length}><Plus size={14} /> Add product</button>}
        </div>

        <div className={styles.summary}>
          <span>Bought separately: <b>{fmt(full, currency)}</b></span>
          <span>Bundle: <b>{fmt(b.price, currency)}</b></span>
          {b.items.length < 2 ? <span className={styles.warn}>Add at least two products.</span>
            : b.price <= 0 ? <span className={styles.warn}>Set a bundle price.</span>
            : saving <= 0 ? <span className={styles.warn}>The bundle price must be lower than buying separately, or it is not shown.</span>
            : <span className={styles.good}>Customer saves {fmt(saving, currency)}</span>}
        </div>
      </div>
    })}
  </div>
}

'use client'

import { useMemo, useState } from 'react'
import { Layers, Plus, Trash2, X } from 'lucide-react'
import { NumInput } from '@/components/num-input'
import { MAX_DEALS, MAX_TIERS, MAX_TIER_PERCENT, dealsProblem, normalizeQuantityDeals, type QuantityDeal, type QuantityDealsConfig, type QuantityTier } from '@/lib/quantity-deals-shared'
import { useConfirm } from './admin-confirm'
import ui from './admin-ui.module.css'
import x from './quantity-deals-admin.module.css'

type Product = { id: string; name: string; basePrice: number; status: string }

const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const fmt = (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`

// What an offer means, in plain words for the owner.
function explain(tier: QuantityTier, currency: string) {
  return tier.kind === 'percent'
    ? `With ${tier.quantity} or more of these in the cart, they are ${tier.value}% off.`
    : `Every ${tier.quantity} of these together cost ${fmt(tier.value, currency)} (the cheapest ones first). Any left over stay at the normal price.`
}

// Admin > Marketing > Quantity deals (app/admin/marketing/quantity-deals).
export default function QuantityDealsAdmin({ initial, products, currency, canManage }: { initial: QuantityDealsConfig; products: Product[]; currency: string; canManage: boolean }) {
  const confirm = useConfirm()
  const [config, setConfig] = useState<QuantityDealsConfig>(initial)
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState<Record<string, string>>({})
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const dirty = JSON.stringify(config) !== saved

  const patch = (id: string, next: Partial<QuantityDeal>) => setConfig(c => ({ ...c, deals: c.deals.map(d => d.id === id ? { ...d, ...next } : d) }))
  const patchTier = (id: string, index: number, next: Partial<QuantityTier>) => setConfig(c => ({ ...c, deals: c.deals.map(d => d.id === id ? { ...d, tiers: d.tiers.map((t, i) => i === index ? { ...t, ...next } : t) } : d) }))
  const addDeal = () => setConfig(c => ({ ...c, deals: [...c.deals, { id: newId(), name: 'Buy more, save more', active: true, scope: 'all', productIds: [], tiers: [{ quantity: 2, kind: 'percent', value: 10 }] }] }))
  async function removeDeal(deal: QuantityDeal) {
    if (!await confirm({ title: `Delete "${deal.name}"?`, message: 'Carts that have it will pay the normal price again.', confirmLabel: 'Delete deal', tone: 'danger' })) return
    setConfig(c => ({ ...c, deals: c.deals.filter(d => d.id !== deal.id) }))
  }

  async function save() {
    setBusy(true); setError(''); setNotice('')
    // Tidy the same way the server will, so what is shown after saving is what was saved.
    const tidy = normalizeQuantityDeals(config)
    const problem = dealsProblem(tidy)
    if (problem) { setError(problem); setBusy(false); return }
    try {
      const res = await fetch('/api/admin/quantity-deals', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tidy) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save the quantity deals right now.')
      setConfig(data); setSaved(JSON.stringify(data))
      setNotice(data.enabled ? 'Saved. Active deals show on your store and are taken off at checkout.' : 'Saved. Quantity deals are switched off, so shoppers do not see them and checkout charges the normal price.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the quantity deals right now.') }
    finally { setBusy(false) }
  }

  return <div className={x.page}>
    <div className={x.header}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>MARKETING</span><h1 className={ui.heading}>Quantity deals</h1><p className={ui.muted}>Reward shoppers who buy more: &ldquo;Buy 2, save 10%&rdquo; or &ldquo;3 for $20&rdquo;.</p></div>
      {canManage && <div className="inline">
        <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addDeal} disabled={config.deals.length >= MAX_DEALS}><Plus size={15} /> New deal</button>
        <button className={ui.btn} onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
      </div>}
    </div>

    {(error || notice) && <div className={`${ui.alert} ${error ? ui.alertDanger : ''}`} role="status">{error || notice}</div>}

    <div className={`${ui.card} ${x.switchCard}`}>
      <div>
        <strong>Use quantity deals on my store</strong>
        <p className={ui.muted}>{config.enabled ? 'On: shoppers see the offers on product pages and in the cart, and the saving is taken off at checkout.' : 'Off: nothing about quantity deals shows, and checkout charges the normal price.'}</p>
        <p className={ui.muted}>One discount per order: if a shopper types a discount code, the code is used instead of a quantity deal. Several deals at once: the one that saves the most is used.</p>
      </div>
      <button type="button" role="switch" aria-checked={config.enabled} aria-label="Use quantity deals on my store" disabled={!canManage} className={`${x.switch} ${config.enabled ? x.on : ''}`} onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}><i /></button>
    </div>

    {!config.deals.length && <div className={`${ui.card} ${ui.empty}`}><Layers size={28} /><h3>No deals yet</h3><p className={ui.muted}>Make one, for example &ldquo;Buy 2, save 10%&rdquo; on a product people buy more than one of.</p>{canManage && <button className={ui.btn} onClick={addDeal}><Plus size={15} /> New deal</button>}</div>}

    {config.deals.map(deal => {
      const q = (search[deal.id] || '').trim().toLowerCase()
      const matches = q ? products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30) : []
      const covered = deal.scope === 'all' ? products : deal.productIds.map(id => byId.get(id)).filter((p): p is Product => !!p)
      const cheapest = covered.length ? Math.min(...covered.map(p => p.basePrice)) : 0
      return <div className={`${ui.card} ${x.deal}`} key={deal.id}>
        <div className={x.head}>
          <label className={x.grow}><span className={ui.fieldLabel}>Name (only you see it)</span><input className={ui.input} value={deal.name} maxLength={120} disabled={!canManage} onChange={e => patch(deal.id, { name: e.target.value })} /></label>
          <label className={x.check}><input type="checkbox" checked={deal.active} disabled={!canManage} onChange={e => patch(deal.id, { active: e.target.checked })} /> Active</label>
          {canManage && <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} aria-label={`Delete ${deal.name}`} onClick={() => removeDeal(deal)}><Trash2 size={15} /></button>}
        </div>

        <div className={x.section}>
          <span className={x.sectionTitle}>Which products</span>
          <div className={x.scope}>
            <button type="button" aria-pressed={deal.scope === 'all'} disabled={!canManage} onClick={() => patch(deal.id, { scope: 'all' })}>Everything in the store</button>
            <button type="button" aria-pressed={deal.scope === 'products'} disabled={!canManage} onClick={() => patch(deal.id, { scope: 'products' })}>Chosen products</button>
          </div>
          {deal.scope === 'all'
            ? <p className={x.rule}>The deal counts any products together: 3 different products in the cart count as 3.</p>
            : <div className={x.picker}>
              {deal.productIds.length > 0 && <div className={x.chosen}>{deal.productIds.map(id => <span className={x.chip} key={id}>{byId.get(id)?.name || 'Deleted product'}{canManage && <button type="button" aria-label="Remove product" onClick={() => patch(deal.id, { productIds: deal.productIds.filter(p => p !== id) })}><X size={13} /></button>}</span>)}</div>}
              {canManage && <input className={ui.input} placeholder="Search a product to add" value={search[deal.id] || ''} onChange={e => setSearch(s => ({ ...s, [deal.id]: e.target.value }))} aria-label="Search products" />}
              {matches.length > 0 && <div className={x.results}>{matches.map(p => <button type="button" key={p.id} disabled={deal.productIds.includes(p.id)} onClick={() => { patch(deal.id, { productIds: [...deal.productIds, p.id] }); setSearch(s => ({ ...s, [deal.id]: '' })) }}><span>{p.name}{p.status !== 'ACTIVE' ? ' (not active)' : ''}</span><span className={ui.muted}>{fmt(p.basePrice, currency)}</span></button>)}</div>}
              {q && !matches.length && <p className={x.rule}>No product found.</p>}
            </div>}
        </div>

        <div className={x.section}>
          <span className={x.sectionTitle}>The offers</span>
          {deal.tiers.map((tier, i) => {
            const noSaving = tier.kind === 'total' && cheapest > 0 && tier.value >= tier.quantity * cheapest
            return <div className={x.tier} key={i}>
              <span>Buy</span>
              <NumInput className={`${ui.input} ${x.num}`} value={tier.quantity} disabled={!canManage} aria-label="Quantity" onValue={n => patchTier(deal.id, i, { quantity: Math.min(99, Math.max(0, Math.floor(Number(n) || 0))) })} />
              <select className={ui.input} value={tier.kind} disabled={!canManage} aria-label="Kind of offer" onChange={e => patchTier(deal.id, i, { kind: e.target.value === 'total' ? 'total' : 'percent', value: e.target.value === 'total' ? Math.max(100, cheapest * tier.quantity) : 10 })}>
                <option value="percent">or more, and save a percent</option>
                <option value="total">together for one price</option>
              </select>
              {tier.kind === 'percent'
                ? <><NumInput className={`${ui.input} ${x.value}`} value={tier.value} disabled={!canManage} aria-label="Percent off" onValue={n => patchTier(deal.id, i, { value: Math.min(MAX_TIER_PERCENT, Math.max(0, Math.floor(Number(n) || 0))) })} /><span>% off</span></>
                : <><NumInput className={`${ui.input} ${x.value}`} decimals value={tier.value / 100} disabled={!canManage} aria-label={`Price for the group (${currency})`} onValue={n => patchTier(deal.id, i, { value: Math.max(0, Math.round((n ?? 0) * 100)) })} /><span>{currency}</span></>}
              {canManage && deal.tiers.length > 1 && <button type="button" className={ui.iconBtn} aria-label="Remove offer" onClick={() => patch(deal.id, { tiers: deal.tiers.filter((_, j) => j !== i) })}><X size={14} /></button>}
              <p className={`${x.tierNote} ${noSaving ? x.warn : ''}`}>{noSaving ? `That is not lower than buying ${tier.quantity} separately (${fmt(tier.quantity * cheapest, currency)}), so it saves nothing.` : explain(tier, currency)}</p>
            </div>
          })}
          {canManage && deal.tiers.length < MAX_TIERS && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => patch(deal.id, { tiers: [...deal.tiers, { quantity: Math.max(2, ...deal.tiers.map(t => t.quantity)) + 1, kind: 'percent', value: 15 }] })}><Plus size={14} /> Add another offer</button>}
          {deal.tiers.length > 1 && <p className={x.rule}>When a cart reaches more than one offer, the one that saves the most is used. They are not added together.</p>}
        </div>
      </div>
    })}
  </div>
}

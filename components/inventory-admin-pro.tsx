'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Check, ChevronDown, History, MapPin, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import ui from './admin-ui.module.css'
import s from './admin-inventory.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

type InventoryRow = any
type Filter = 'ALL' | 'IN_STOCK' | 'LOW' | 'OUT'
type DrawerTab = 'ADJUST' | 'HISTORY'

function availability(row: InventoryRow) {
  const quantity = Number(row.quantity || 0)
  const reserved = Number(row.reserved || 0)
  return { quantity, reserved, available: Math.max(0, quantity - reserved) }
}
function statusFor(row: InventoryRow) {
  const a = availability(row)
  const threshold = Number(row.lowStockThreshold ?? 5)
  if (a.available <= 0) return { label: 'Out of stock', tone: 'danger' }
  if (a.available <= threshold) return { label: 'Low stock', tone: 'warning' }
  return { label: 'In stock', tone: 'success' }
}
function formatMovement(row: any) {
  const type = String(row.type || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (m: string) => m.toUpperCase())
  const qty = Number(row.quantity || 0)
  return `${qty >= 0 ? '+' : '-'}${Math.abs(qty)} ${type}`
}

type StoreLocationRow = { id: string; name: string; isDefault?: boolean }

export default function InventoryAdminPro({ initial, locations: locationOptions, canManage = true }: { initial: InventoryRow[]; locations?: StoreLocationRow[]; canManage?: boolean }) {
  const [rows, setRows] = useState<InventoryRow[]>(initial || [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [location, setLocation] = useState('ALL')
  const [selected, setSelected] = useState<InventoryRow | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('ADJUST')
  const [delta, setDelta] = useState('1')
  const [reason, setReason] = useState('Stock received')
  const [movementType, setMovementType] = useState<'ADJUSTMENT' | 'DAMAGE'>('ADJUSTMENT')
  const [newLocationId, setNewLocationId] = useState('')
  const [threshold, setThreshold] = useState('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const locations = locationOptions || []
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      const state = statusFor(r).label
      const matchesQ = !needle || `${r.product?.name || ''} ${r.product?.sku || ''} ${r.variant?.name || ''} ${r.variant?.sku || ''}`.toLowerCase().includes(needle)
      const matchesFilter = filter === 'ALL' || (filter === 'IN_STOCK' && state === 'In stock') || (filter === 'LOW' && state === 'Low stock') || (filter === 'OUT' && state === 'Out of stock')
      const matchesLocation = location === 'ALL' || (location === 'UNASSIGNED' ? !r.locationId : r.locationId === location)
      return matchesQ && matchesFilter && matchesLocation
    })
  }, [rows, q, filter, location])
  const stats = useMemo(() => rows.reduce((acc, r) => {
    const s = availability(r)
    acc.onHand += s.quantity
    acc.reserved += s.reserved
    acc.available += s.available
    const state = statusFor(r).label
    if (state === 'Low stock') acc.low += 1
    if (state === 'Out of stock') acc.out += 1
    return acc
  }, { onHand: 0, reserved: 0, available: 0, low: 0, out: 0 }), [rows])

  function openAdjust(row: InventoryRow, amount = 1) {
    setSelected(row)
    setDrawerTab(canManage ? 'ADJUST' : 'HISTORY')
    setDelta(String(amount))
    setReason(amount > 0 ? 'Stock received' : amount < 0 ? 'Stock reduction' : 'Stock adjustment')
    setMovementType('ADJUSTMENT')
    setNewLocationId(row.locationId || '')
    setThreshold(String(row.lowStockThreshold ?? 5))
    setError('')
    setNotice('')
  }
  function closeDrawer() { if (!busy) setSelected(null) }

  async function saveAdjustment() {
    if (!selected) return
    const change = Number(delta)
    const thresholdValue = Number(threshold)
    if (!Number.isInteger(change)) return setError('Enter a whole-number adjustment.')
    if (change < 0 && Math.abs(change) > availability(selected).available) return setError(`You cannot reduce more than the ${availability(selected).available} currently available units.`)
    if (!Number.isInteger(thresholdValue) || thresholdValue < 0) return setError('Low-stock threshold must be a non-negative whole number.')
    if (reason === 'Damaged stock' && (movementType !== 'DAMAGE' || change >= 0)) return setError('Damaged stock must use a negative quantity and DAMAGE movement type.')
    const originalThreshold = Number(selected.lowStockThreshold ?? 5)
    const originalLocationId = selected.locationId || ''
    if (change === 0 && thresholdValue === originalThreshold && newLocationId === originalLocationId) return setError('Make a change before saving.')

    setBusy(true); setError(''); setNotice('')
    try {
      const payload = { id: selected.id, delta: change, reason, movementType, locationId: newLocationId || null, lowStockThreshold: thresholdValue }
      const data = await api('/api/admin/inventory', { method: 'PATCH', body: JSON.stringify(payload) })
      setRows(prev => prev.map(r => r.id === selected.id ? { ...r, ...data.item, product: r.product, variant: r.variant, movements: data.item.movements || r.movements } : r))
      setSelected(null)
      setNotice(change === 0 ? 'Inventory settings updated.' : `${change > 0 ? '+' : ''}${change} units updated.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update inventory')
    } finally {
      setBusy(false)
    }
  }

  const current = selected ? availability(selected) : null
  const selectedStatus = selected ? statusFor(selected) : null

  return <div className={s.page}>
    <div className={ui.sectionHead}>
      <div><span className={`${ui.muted} ${ui.tiny}`}>PRODUCTS · INVENTORY</span><h1 className={ui.title}>Inventory</h1><p className={ui.muted}>Keep every location accurate and every available quantity sellable.</p></div>
      <div className={s.liveBadge}><span className={s.liveDot}/><span>Live inventory</span></div>
    </div>

    {error && !selected && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {notice && <div className={ui.alert}><Check size={15}/>{notice}</div>}

    <div className={s.statsGrid}>
      <button type="button" className={`${ui.card} ${s.stat} ${s.statClickable} ${filter === 'ALL' ? s.statActive : ''}`} onClick={() => setFilter('ALL')}>
        <span>All stock</span><strong>{rows.length.toLocaleString()}</strong><small>Inventory records</small>
      </button>
      <div className={`${ui.card} ${s.stat}`}><span>Available</span><strong>{stats.available.toLocaleString()}</strong><small>Sellable units</small></div>
      <div className={`${ui.card} ${s.stat}`}><span>Reserved</span><strong>{stats.reserved.toLocaleString()}</strong><small>Held for orders</small></div>
      <button type="button" className={`${ui.card} ${s.stat} ${s.statClickable} ${s.statWarning} ${filter === 'LOW' ? s.statActive : ''}`} onClick={() => setFilter('LOW')}>
        <span>Low stock</span><strong>{stats.low}</strong><small>Needs attention</small>
      </button>
      <button type="button" className={`${ui.card} ${s.stat} ${s.statClickable} ${s.statDanger} ${filter === 'OUT' ? s.statActive : ''}`} onClick={() => setFilter('OUT')}>
        <span>Out of stock</span><strong>{stats.out}</strong><small>Needs replenishment</small>
      </button>
    </div>

    <div className={`${ui.card} ${s.controlBar}`}>
      <div className={s.searchBox}>
        <Search size={17}/><input aria-label="Search inventory" value={q} onChange={e => setQ(e.target.value)} placeholder="Search products, SKUs, variants…"/>
        {q && <button type="button" className={s.searchClear} onClick={() => setQ('')}><X size={14}/></button>}
      </div>
      <div className={s.controlGroup}>
        <div className={s.selectField}><SlidersHorizontal size={15}/><select aria-label="Inventory status" value={filter} onChange={e => setFilter(e.target.value as Filter)}><option value="ALL">All stock</option><option value="IN_STOCK">In stock</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option></select><ChevronDown size={14}/></div>
        <div className={s.selectField}><MapPin size={15}/><select aria-label="Inventory location" value={location} onChange={e => setLocation(e.target.value)}><option value="ALL">All locations</option><option value="UNASSIGNED">Unassigned</option>{locations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select><ChevronDown size={14}/></div>
      </div>
    </div>

    <div className={ui.card}>
      <div className={s.tableHeader}><div><strong>{filtered.length.toLocaleString()} visible records</strong><span className={ui.muted}> · {rows.length.toLocaleString()} total · {locations.length} {locations.length === 1 ? 'location' : 'locations'}</span></div><div className={ui.muted}>Click a row to adjust stock</div></div>
      <div className={ui.tableWrap}><table className={ui.table}><thead><tr><th>Product</th><th>Location</th><th style={{ textAlign: 'right' }}>On hand</th><th style={{ textAlign: 'right' }}>Reserved</th><th style={{ textAlign: 'right' }}>Available</th><th>Status</th><th style={{ textAlign: 'right' }}>Quick adjust</th></tr></thead><tbody>
        {filtered.map(r => { const a = availability(r), state = statusFor(r); return <tr key={r.id} className={s.row} onClick={() => openAdjust(r, 0)}>
          <td><div className={s.productCell}><div className={s.thumb}>{r.product?.images?.[0]?.url ? <img src={r.product.images[0].url} alt=""/> : <Boxes size={18}/>}</div><div><strong>{r.product?.name || 'Product'}</strong><div className={ui.muted}>{r.variant?.name || r.product?.sku || 'Default'}{r.variant?.sku ? ` · ${r.variant.sku}` : ''}</div></div></div></td>
          <td><span className={s.locationTag}><MapPin size={13}/>{r.location?.name || 'Unassigned'}</span></td><td style={{ textAlign: 'right' }}><strong>{a.quantity}</strong></td><td style={{ textAlign: 'right' }}><span className={s.reservedValue}>{a.reserved}</span></td><td style={{ textAlign: 'right' }}><strong className={a.available <= 0 ? `${s.qty} ${s.qtyDanger}` : a.available <= Number(r.lowStockThreshold ?? 5) ? `${s.qty} ${s.qtyWarning}` : s.qty}>{a.available}</strong></td>
          <td><span className={`${ui.statusPill} ${state.tone === 'success' ? ui.statusPillSuccess : state.tone === 'warning' ? ui.statusPillWarning : ui.statusPillDanger}`}>{state.tone === 'success' ? <Check size={12}/> : <AlertTriangle size={12}/>} {state.label}</span></td>
          <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>{canManage ? <div className={s.quickActions}><button type="button" title="Add 1" onClick={() => openAdjust(r, 1)}><Plus size={14}/></button><button type="button" title={availability(r).available > 0 ? 'Remove 1' : 'No available units to remove'} onClick={() => openAdjust(r, -1)} disabled={availability(r).available <= 0}><Minus size={14}/></button></div> : <span className={ui.muted}>View only</span>}</td>
        </tr> })}
      </tbody></table></div>
      {!filtered.length && <div className={ui.empty}><Boxes size={30}/><h3>No inventory found</h3><p className={ui.muted}>Try a different search, stock status, or location.</p></div>}
    </div>

    {selected && <div className={s.drawerOverlay} onMouseDown={closeDrawer}>
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label={`Edit inventory for ${selected.product?.name || 'product'}`} onMouseDown={e => e.stopPropagation()}>
        <div className={s.drawerHeader}><div><span className={`${ui.muted} ${ui.tiny}`}>INVENTORY</span><h2>{selected.product?.name || 'Product'}</h2><p className={ui.muted}>{selected.variant?.name || selected.product?.sku || 'Default'} · {selected.location?.name || 'Unassigned'}</p></div><button type="button" className={s.drawerClose} onClick={closeDrawer} disabled={busy} aria-label="Close inventory drawer"><X size={18}/></button></div>
        <div className={s.drawerStats}><div><span>On hand</span><strong>{current?.quantity}</strong></div><div><span>Reserved</span><strong>{current?.reserved}</strong></div><div><span>Available</span><strong>{current?.available}</strong></div></div>
        <div className={s.drawerStatus}><span className={`${ui.statusPill} ${selectedStatus?.tone === 'success' ? ui.statusPillSuccess : selectedStatus?.tone === 'warning' ? ui.statusPillWarning : ui.statusPillDanger}`}>{selectedStatus?.tone === 'success' ? <Check size={12}/> : <AlertTriangle size={12}/>} {selectedStatus?.label}</span><span className={ui.muted}>Threshold {selected.lowStockThreshold ?? 5}</span></div>
        <div className={s.drawerTabs}><button type="button" className={drawerTab === 'ADJUST' ? s.active : ''} onClick={() => setDrawerTab('ADJUST')}>Adjust</button><button type="button" className={drawerTab === 'HISTORY' ? s.active : ''} onClick={() => setDrawerTab('HISTORY')}>History</button></div>
        {drawerTab === 'ADJUST' ? <div className={s.drawerBody}>
          <div className={s.amountBlock}><div className={s.fieldLabel}><span>Quantity adjustment</span><small>Use + for receiving and − for reductions</small></div><div className={s.quickAmounts}>{[-10, -5, -1, 1, 5, 10].map(v => <button type="button" key={v} className={delta === String(v) ? s.active : ''} disabled={v < 0 && current != null && Math.abs(v) > current.available} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}</div><input className={s.amountInput} aria-label="Quantity adjustment" type="number" step="1" value={delta} onChange={e => setDelta(e.target.value)}/></div>
          <label className={s.fieldLabel}><span>Reason</span><select className={ui.select} value={reason} onChange={e => { const value = e.target.value; setReason(value); if (value === 'Damaged stock') { setMovementType('DAMAGE'); if (Number(delta) > 0) setDelta(String(-Number(delta))) } else setMovementType('ADJUSTMENT') }}><option>Stock received</option><option>Stock return</option><option>Stock count correction</option><option>Stock reduction</option><option>Damaged stock</option><option>Stock adjustment</option></select></label>
          {reason === 'Damaged stock' && <label className={s.fieldLabel}><span>Movement type</span><select className={ui.select} value={movementType} onChange={e => setMovementType(e.target.value as 'ADJUSTMENT' | 'DAMAGE')}><option value="DAMAGE">Damage</option><option value="ADJUSTMENT">Adjustment</option></select></label>}
          <div className={s.twoFields}><label className={s.fieldLabel}><span>Location</span><select className={ui.select} value={newLocationId} onChange={e => setNewLocationId(e.target.value)}><option value="">Unassigned</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className={s.fieldLabel}><span>Low-stock threshold</span><input className={ui.input} min="0" type="number" value={threshold} onChange={e => setThreshold(e.target.value)}/></label></div>
          {Number(delta) !== 0 && current && <div className={s.preview}><div><span>Current available</span><strong>{current.available}</strong></div><div><span>After adjustment</span><strong>{Math.max(0, current.quantity + Number(delta) - current.reserved)}</strong></div></div>}
          {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
          <div className={s.drawerActions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy} onClick={closeDrawer}>Cancel</button><button type="button" className={ui.btn} disabled={busy} onClick={saveAdjustment}>{busy ? 'Saving…' : 'Save adjustment'}</button></div>
        </div> : <div className={s.historyList}>{(selected.movements || []).length ? selected.movements.map((m: any) => <div className={s.historyItem} key={m.id}><div className={s.historyIcon}><History size={14}/></div><div><strong>{formatMovement(m)}</strong><div className={ui.muted}>{m.reason || 'Inventory update'} · {new Date(m.createdAt).toLocaleString()}</div></div></div>) : <div className={`${ui.empty} ${s.emptyCompact}`}><History size={24}/><p className={ui.muted}>No inventory movements loaded.</p></div>}</div>}
      </aside>
    </div>}
  </div>
}

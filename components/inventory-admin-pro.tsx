'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Check, ChevronDown, History, MapPin, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react'

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
  const s = availability(row)
  const threshold = Number(row.lowStockThreshold ?? 5)
  if (s.available <= 0) return { label: 'Out of stock', tone: 'danger' }
  if (s.available <= threshold) return { label: 'Low stock', tone: 'warning' }
  return { label: 'In stock', tone: 'success' }
}
function formatMovement(row: any) {
  const type = String(row.type || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (m: string) => m.toUpperCase())
  const qty = Number(row.quantity || 0)
  return `${qty >= 0 ? '+' : '-'}${Math.abs(qty)} ${type}`
}

export default function InventoryAdminPro({ initial, canManage = true }: { initial: InventoryRow[]; canManage?: boolean }) {
  const [rows, setRows] = useState<InventoryRow[]>(initial || [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [location, setLocation] = useState('ALL')
  const [selected, setSelected] = useState<InventoryRow | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('ADJUST')
  const [delta, setDelta] = useState('1')
  const [reason, setReason] = useState('Stock received')
  const [movementType, setMovementType] = useState<'ADJUSTMENT' | 'DAMAGE'>('ADJUSTMENT')
  const [newLocation, setNewLocation] = useState('')
  const [threshold, setThreshold] = useState('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const locations = useMemo(() => Array.from(new Set(rows.map(r => String(r.location || 'Main')).filter(Boolean))).sort(), [rows])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      const state = statusFor(r).label
      const matchesQ = !needle || `${r.product?.name || ''} ${r.product?.sku || ''} ${r.variant?.name || ''} ${r.variant?.sku || ''}`.toLowerCase().includes(needle)
      const matchesFilter = filter === 'ALL' || (filter === 'IN_STOCK' && state === 'In stock') || (filter === 'LOW' && state === 'Low stock') || (filter === 'OUT' && state === 'Out of stock')
      const matchesLocation = location === 'ALL' || String(r.location || 'Main') === location
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
    setNewLocation(String(row.location || 'Main'))
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
    if (newLocation.trim().length > 120) return setError('Location is too long.')
    if (reason === 'Damaged stock' && (movementType !== 'DAMAGE' || change >= 0)) return setError('Damaged stock must use a negative quantity and DAMAGE movement type.')
    const originalThreshold = Number(selected.lowStockThreshold ?? 5)
    const originalLocation = String(selected.location || 'Main')
    if (change === 0 && thresholdValue === originalThreshold && newLocation.trim() === originalLocation) return setError('Make a change before saving.')

    setBusy(true); setError(''); setNotice('')
    try {
      const payload = { id: selected.id, delta: change, reason, movementType, location: newLocation.trim() || 'Main', lowStockThreshold: thresholdValue }
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

  return <div className="inventoryPage">
    <div className="sectionHead inventoryHead">
      <div><span className="muted tiny">PRODUCTS · INVENTORY</span><h1 className="h2">Inventory</h1><p className="muted">Keep every location accurate and every available quantity sellable.</p></div>
      <div className="inventoryLive"><span className="inventoryLiveDot"/><span>Live inventory</span></div>
    </div>

    {error && !selected && <div className="alert danger">{error}</div>}
    {notice && <div className="alert inventoryNotice"><Check size={15}/>{notice}</div>}

    <div className="inventoryStats inventoryStatsPro">
      <button type="button" className={filter === 'ALL' ? 'inventoryStat clickable active' : 'inventoryStat clickable'} onClick={() => setFilter('ALL')}>
        <span>All stock</span><strong>{rows.length.toLocaleString()}</strong><small>Inventory records</small>
      </button>
      <div className="inventoryStat"><span>Available</span><strong>{stats.available.toLocaleString()}</strong><small>Sellable units</small></div>
      <div className="inventoryStat"><span>Reserved</span><strong>{stats.reserved.toLocaleString()}</strong><small>Held for orders</small></div>
      <button type="button" className={filter === 'LOW' ? 'inventoryStat clickable active warning' : 'inventoryStat clickable warning'} onClick={() => setFilter('LOW')}>
        <span>Low stock</span><strong>{stats.low}</strong><small>Needs attention</small>
      </button>
      <button type="button" className={filter === 'OUT' ? 'inventoryStat clickable active danger' : 'inventoryStat clickable danger'} onClick={() => setFilter('OUT')}>
        <span>Out of stock</span><strong>{stats.out}</strong><small>Needs replenishment</small>
      </button>
    </div>

    <div className="card inventoryControlBar">
      <div className="inventorySearchBox">
        <Search size={17}/><input aria-label="Search inventory" value={q} onChange={e => setQ(e.target.value)} placeholder="Search products, SKUs, variants…"/>
        {q && <button type="button" className="inventorySearchClear" onClick={() => setQ('')}><X size={14}/></button>}
      </div>
      <div className="inventoryControlGroup">
        <div className="inventorySelect"><SlidersHorizontal size={15}/><select aria-label="Inventory status" value={filter} onChange={e => setFilter(e.target.value as Filter)}><option value="ALL">All stock</option><option value="IN_STOCK">In stock</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option></select><ChevronDown size={14}/></div>
        <div className="inventorySelect"><MapPin size={15}/><select aria-label="Inventory location" value={location} onChange={e => setLocation(e.target.value)}><option value="ALL">All locations</option>{locations.map(x => <option key={x} value={x}>{x}</option>)}</select><ChevronDown size={14}/></div>
      </div>
    </div>

    <div className="card inventoryTableShell">
      <div className="inventoryTableHeader"><div><strong>{filtered.length.toLocaleString()} visible records</strong><span className="muted"> · {rows.length.toLocaleString()} total · {locations.length} {locations.length === 1 ? 'location' : 'locations'}</span></div><div className="muted">Click a row to adjust stock</div></div>
      <div className="tableWrap"><table className="table inventoryTablePro"><thead><tr><th>Product</th><th>Location</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th>Status</th><th className="actionsCol">Quick adjust</th></tr></thead><tbody>
        {filtered.map(r => { const s = availability(r), state = statusFor(r); return <tr key={r.id} className="inventoryRow" onClick={() => openAdjust(r, 0)}>
          <td><div className="inventoryProductCell"><div className="inventoryThumb">{r.product?.images?.[0]?.url ? <img src={r.product.images[0].url} alt=""/> : <Boxes size={18}/>}</div><div><strong>{r.product?.name || 'Product'}</strong><div className="muted">{r.variant?.name || r.product?.sku || 'Default'}{r.variant?.sku ? ` · ${r.variant.sku}` : ''}</div></div></div></td>
          <td><span className="inventoryLocation"><MapPin size={13}/>{r.location || 'Main'}</span></td><td className="num"><strong>{s.quantity}</strong></td><td className="num"><span className="reservedValue">{s.reserved}</span></td><td className="num"><strong className={s.available <= 0 ? 'inventoryQty dangerText' : s.available <= Number(r.lowStockThreshold ?? 5) ? 'inventoryQty warningText' : 'inventoryQty'}>{s.available}</strong></td>
          <td><span className={`inventoryStatus ${state.tone}`}>{state.tone === 'success' ? <Check size={12}/> : <AlertTriangle size={12}/>} {state.label}</span></td>
          <td className="actionsCol" onClick={e => e.stopPropagation()}>{canManage ? <div className="inventoryQuick"><button type="button" title="Add 1" onClick={() => openAdjust(r, 1)}><Plus size={14}/></button><button type="button" title={availability(r).available > 0 ? 'Remove 1' : 'No available units to remove'} onClick={() => openAdjust(r, -1)} disabled={availability(r).available <= 0}><Minus size={14}/></button></div> : <span className="muted">View only</span>}</td>
        </tr> })}
      </tbody></table></div>
      {!filtered.length && <div className="inventoryEmpty"><Boxes size={30}/><h3>No inventory found</h3><p className="muted">Try a different search, stock status, or location.</p></div>}
    </div>

    {selected && <div className="inventoryDrawerOverlay" onMouseDown={closeDrawer}>
      <aside className="inventoryDrawer" role="dialog" aria-modal="true" aria-label={`Edit inventory for ${selected.product?.name || 'product'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="inventoryDrawerHeader"><div><span className="muted tiny">INVENTORY</span><h2>{selected.product?.name || 'Product'}</h2><p className="muted">{selected.variant?.name || selected.product?.sku || 'Default'} · {selected.location || 'Main'}</p></div><button type="button" className="inventoryClose" onClick={closeDrawer} disabled={busy} aria-label="Close inventory drawer"><X size={18}/></button></div>
        <div className="inventoryDrawerStats"><div><span>On hand</span><strong>{current?.quantity}</strong></div><div><span>Reserved</span><strong>{current?.reserved}</strong></div><div><span>Available</span><strong>{current?.available}</strong></div></div>
        <div className="inventoryDrawerStatus"><span className={`inventoryStatus ${selectedStatus?.tone}`}>{selectedStatus?.tone === 'success' ? <Check size={12}/> : <AlertTriangle size={12}/>} {selectedStatus?.label}</span><span className="muted">Threshold {selected.lowStockThreshold ?? 5}</span></div>
        <div className="inventoryDrawerTabs"><button type="button" className={drawerTab === 'ADJUST' ? 'active' : ''} onClick={() => setDrawerTab('ADJUST')}>Adjust</button><button type="button" className={drawerTab === 'HISTORY' ? 'active' : ''} onClick={() => setDrawerTab('HISTORY')}>History</button></div>
        {drawerTab === 'ADJUST' ? <div className="inventoryDrawerBody">
          <div className="inventoryAmountBlock"><div className="inventoryFieldLabel"><span>Quantity adjustment</span><small>Use + for receiving and − for reductions</small></div><div className="inventoryQuickAmounts">{[-10, -5, -1, 1, 5, 10].map(v => <button type="button" key={v} className={delta === String(v) ? 'active' : ''} disabled={v < 0 && current != null && Math.abs(v) > current.available} onClick={() => setDelta(String(v))}>{v > 0 ? `+${v}` : v}</button>)}</div><input className="inventoryAmountInput" aria-label="Quantity adjustment" type="number" step="1" value={delta} onChange={e => setDelta(e.target.value)}/></div>
          <label className="inventoryFieldLabel"><span>Reason</span><select className="input" value={reason} onChange={e => { const value = e.target.value; setReason(value); if (value === 'Damaged stock') { setMovementType('DAMAGE'); if (Number(delta) > 0) setDelta(String(-Number(delta))) } else setMovementType('ADJUSTMENT') }}><option>Stock received</option><option>Stock return</option><option>Stock count correction</option><option>Stock reduction</option><option>Damaged stock</option><option>Stock adjustment</option></select></label>
          {reason === 'Damaged stock' && <label className="inventoryFieldLabel"><span>Movement type</span><select className="input" value={movementType} onChange={e => setMovementType(e.target.value as 'ADJUSTMENT' | 'DAMAGE')}><option value="DAMAGE">Damage</option><option value="ADJUSTMENT">Adjustment</option></select></label>}
          <div className="inventoryTwoFields"><label className="inventoryFieldLabel"><span>Location</span><input className="input" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Main"/></label><label className="inventoryFieldLabel"><span>Low-stock threshold</span><input className="input" min="0" type="number" value={threshold} onChange={e => setThreshold(e.target.value)}/></label></div>
          {Number(delta) !== 0 && current && <div className="inventoryPreview"><div><span>Current available</span><strong>{current.available}</strong></div><div><span>After adjustment</span><strong>{Math.max(0, current.quantity + Number(delta) - current.reserved)}</strong></div></div>}
          {error && <div className="alert danger">{error}</div>}
          <div className="inventoryDrawerActions"><button type="button" className="btn secondary" disabled={busy} onClick={closeDrawer}>Cancel</button><button type="button" className="btn" disabled={busy} onClick={saveAdjustment}>{busy ? 'Saving…' : 'Save adjustment'}</button></div>
        </div> : <div className="inventoryHistoryList">{(selected.movements || []).length ? selected.movements.map((m: any) => <div className="inventoryHistoryItem" key={m.id}><div className="historyIcon"><History size={14}/></div><div><strong>{formatMovement(m)}</strong><div className="muted">{m.reason || 'Inventory update'} · {new Date(m.createdAt).toLocaleString()}</div></div></div>) : <div className="inventoryEmpty compact"><History size={24}/><p className="muted">No inventory movements loaded.</p></div>}</div>}
      </aside>
    </div>}
  </div>
}

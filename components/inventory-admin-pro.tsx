'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, History, MapPin, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

type InventoryRow = any

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

export default function InventoryAdminPro({ initial }: { initial: InventoryRow[] }) {
  const [rows, setRows] = useState<InventoryRow[]>(initial || [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [location, setLocation] = useState('ALL')
  const [selected, setSelected] = useState<InventoryRow | null>(null)
  const [delta, setDelta] = useState('1')
  const [reason, setReason] = useState('Stock adjustment')
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
  const stats = useMemo(() => rows.reduce((acc, r) => { const s = availability(r); acc.onHand += s.quantity; acc.reserved += s.reserved; acc.available += s.available; const state = statusFor(r).label; if (state === 'Low stock') acc.low += 1; if (state === 'Out of stock') acc.out += 1; return acc }, { onHand: 0, reserved: 0, available: 0, low: 0, out: 0 }), [rows])

  function openAdjust(row: InventoryRow, amount = 1) {
    setSelected(row); setDelta(String(amount)); setReason(amount > 0 ? 'Stock received' : amount < 0 ? 'Stock reduction' : 'Stock adjustment'); setNewLocation(String(row.location || 'Main')); setThreshold(String(row.lowStockThreshold ?? 5)); setError(''); setNotice('')
  }

  async function saveAdjustment() {
    if (!selected) return
    const change = Number(delta)
    if (!Number.isInteger(change)) return setError('Enter a whole number adjustment.')
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await api('/api/admin/inventory', { method: 'PATCH', body: JSON.stringify({ id: selected.id, delta: change, reason, location: newLocation, lowStockThreshold: Number(threshold) }) })
      setRows(prev => prev.map(r => r.id === selected.id ? { ...r, ...data.item, product: r.product, variant: r.variant, movements: data.item.movements || r.movements } : r))
      setSelected(null)
      setNotice(change === 0 ? 'Inventory settings updated successfully.' : `${change > 0 ? '+' : ''}${change} units applied successfully.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to adjust inventory') }
    finally { setBusy(false) }
  }

  return <div className="inventoryPage">
    <div className="sectionHead inventoryHead"><div><span className="muted">OPERATIONS</span><h1 className="h2">Inventory</h1><p className="muted">Monitor stock, reservations and availability across your catalog.</p></div><div className="inventoryHeadIcon"><Boxes size={18}/><span>Live stock control</span></div></div>
    {error && !selected && <div className="alert danger">{error}</div>}{notice && <div className="alert">{notice}</div>}
    <div className="inventoryStats"><div className="inventoryStat"><span>Units on hand</span><strong>{stats.onHand.toLocaleString()}</strong><small>Total physical inventory</small></div><div className="inventoryStat"><span>Reserved</span><strong>{stats.reserved.toLocaleString()}</strong><small>Held for open orders</small></div><div className="inventoryStat"><span>Available</span><strong>{stats.available.toLocaleString()}</strong><small>Sellable right now</small></div><button className="inventoryStat clickable" onClick={() => setFilter('LOW')}><span>Low stock</span><strong>{stats.low}</strong><small>Needs attention</small></button><button className="inventoryStat clickable" onClick={() => setFilter('OUT')}><span>Out of stock</span><strong>{stats.out}</strong><small>Needs replenishment</small></button></div>
    <div className="card inventoryToolbar"><div className="productSearch inventorySearch"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products, SKUs or variants…"/><button className="searchClear" hidden={!q} onClick={() => setQ('')}><X size={14}/></button></div><div className="inventoryToolbarControls"><div className="selectWrap"><SlidersHorizontal size={15}/><select className="input" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All inventory</option><option value="IN_STOCK">In stock</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option></select></div><div className="selectWrap"><MapPin size={15}/><select className="input" value={location} onChange={e => setLocation(e.target.value)}><option value="ALL">All locations</option>{locations.map(x => <option key={x}>{x}</option>)}</select></div></div></div>
    <div className="card productTableCard inventoryTableCard"><div className="tableTopline"><span className="muted">{filtered.length.toLocaleString()} stock records</span><span className="muted">{locations.length} location{locations.length === 1 ? '' : 's'}</span></div><div className="tableWrap"><table className="table inventoryTable"><thead><tr><th>Item</th><th>Location</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Status</th><th>Quick adjust</th><th></th></tr></thead><tbody>{filtered.map(r => { const s = availability(r); const state = statusFor(r); return <tr key={r.id}><td><div className="inventoryItemCell"><div className="productThumb">{r.product?.images?.[0]?.url ? <img src={r.product.images[0].url} alt=""/> : <Boxes size={17}/>}</div><div><strong>{r.product?.name || 'Product'}</strong><div className="muted">{r.variant?.name || r.product?.sku || 'Default'}{r.variant?.sku ? ` · ${r.variant.sku}` : ''}</div></div></div></td><td><span className="locationPill"><MapPin size={13}/>{r.location || 'Main'}</span></td><td><strong>{s.quantity}</strong></td><td>{s.reserved}</td><td><strong className={s.available <= 0 ? 'dangerText' : s.available <= Number(r.lowStockThreshold ?? 5) ? 'warningText' : ''}>{s.available}</strong></td><td><span className={`statusPill ${state.tone}`}>{state.tone === 'danger' ? <AlertTriangle size={13}/> : state.tone === 'warning' ? <AlertTriangle size={13}/> : <Boxes size={13}/>} {state.label}</span></td><td><div className="quickAdjust"><button className="iconBtn" title="Remove 1" onClick={() => openAdjust(r, -1)}><Minus size={15}/></button><button className="iconBtn" title="Add 1" onClick={() => openAdjust(r, 1)}><Plus size={15}/></button></div></td><td><button className="textButton inventoryEditBtn" onClick={() => openAdjust(r, 0)}>Adjust</button></td></tr>})}</tbody></table></div>{!filtered.length && <div className="empty"><Boxes size={28}/><h3>No inventory matches</h3><p className="muted">Try another search or filter.</p></div>}</div>
    {selected && <div className="modalOverlay" onClick={() => !busy && setSelected(null)}><div className="inventoryModal card" onClick={e => e.stopPropagation()}><div className="inventoryModalHead"><div><span className="muted tiny">STOCK ADJUSTMENT</span><h2>{selected.product?.name || 'Product'}</h2><p className="muted">{selected.variant?.name || selected.product?.sku || 'Default variant'}</p></div><button className="iconBtn" onClick={() => setSelected(null)} disabled={busy}><X size={17}/></button></div><div className="inventoryModalGrid"><div className="modalMetric"><span>On hand</span><strong>{availability(selected).quantity}</strong></div><div className="modalMetric"><span>Reserved</span><strong>{availability(selected).reserved}</strong></div><div className="modalMetric"><span>Available</span><strong>{availability(selected).available}</strong></div></div><div className="inventoryFormGrid"><label className="fieldLabel">Adjustment<input className="input" type="number" step="1" value={delta} onChange={e => setDelta(e.target.value)}/><small className="fieldHelp">Positive adds stock, negative removes stock. Use 0 to save location or threshold only.</small></label><label className="fieldLabel">Reason<input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is stock changing?"/></label><label className="fieldLabel">Location<input className="input" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Main"/></label><label className="fieldLabel">Low-stock threshold<input className="input" type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)}/></label></div><div className="inventoryMovementPreview"><History size={15}/><span>{(selected.movements || []).length ? `${Math.min((selected.movements || []).length, 10)} recent movement${(selected.movements || []).length === 1 ? '' : 's'} available` : 'No recent movements recorded'}</span></div>{error && <div className="alert danger">{error}</div>}<div className="inline" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="btn secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button><button className="btn" disabled={busy} onClick={saveAdjustment}>{busy ? 'Saving…' : 'Apply adjustment'}</button></div></div></div>}
  </div>
}

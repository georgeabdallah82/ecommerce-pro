'use client'

import { useEffect, useMemo, useState } from 'react'
import { Boxes, ClipboardList, CreditCard, MapPin, RefreshCw, ShoppingCart, Truck, UsersRound } from 'lucide-react'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

function Card({ icon: Icon, title, count, tone = 'neutral' }: { icon: any; title: string; count: number | string; tone?: string }) {
  return <div className={`opsCard ${tone}`}><div className="opsCardIcon"><Icon size={17}/></div><div><div className="muted opsLabel">{title}</div><strong className="opsCount">{count}</strong></div></div>
}

export default function AdminOperationsHub() {
  const [data, setData] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const endpoints: Record<string, string> = {
      locations: '/api/admin/locations',
      transfers: '/api/admin/inventory-transfers',
      drafts: '/api/admin/draft-orders',
      purchaseOrders: '/api/admin/purchase-orders',
      giftCards: '/api/admin/gift-cards',
      abandoned: '/api/admin/abandoned-checkouts',
      channels: '/api/admin/sales-channels',
      webhooks: '/api/admin/webhooks',
      credentials: '/api/admin/api-credentials',
    }
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
      try {
        const value = await api(path)
        return [key, Array.isArray(value) ? value : (Array.isArray(value?.items) ? value.items : Array.isArray(value?.rows) ? value.rows : [])] as const
      } catch { return [key, []] as const }
    }))
    setData(Object.fromEntries(entries))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    locations: data.locations?.length || 0,
    transfers: data.transfers?.length || 0,
    drafts: data.drafts?.length || 0,
    purchaseOrders: data.purchaseOrders?.length || 0,
    giftCards: data.giftCards?.length || 0,
    abandoned: data.abandoned?.length || 0,
    channels: data.channels?.length || 0,
    webhooks: data.webhooks?.length || 0,
    credentials: data.credentials?.length || 0,
  }), [data])

  async function seedLocation() {
    setBusy(true); setError('')
    try { await api('/api/admin/locations', { method: 'POST', body: JSON.stringify({ name: 'Main location', isDefault: true }) }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create location') }
    finally { setBusy(false) }
  }

  const tabs = [
    ['overview', 'Overview'], ['inventory', 'Inventory ops'], ['orders', 'Order ops'], ['customers', 'Customers & payments'], ['integrations', 'Channels & integrations']
  ]

  return <div className="operationsPage">
    <div className="sectionHead catalogHead"><div><span className="muted">OPERATIONS</span><h1 className="h2">Operations hub</h1><p className="muted">One control surface for the advanced commerce workflows behind your store.</p></div><button className="btn secondary" disabled={loading} onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    {error && <div className="alert danger">{error}</div>}
    <div className="opsTabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>

    {loading ? <div className="card opsLoading">Loading operations…</div> : <>
      {tab === 'overview' && <>
        <div className="opsGrid">
          <Card icon={MapPin} title="Locations" count={counts.locations}/><Card icon={Truck} title="Transfers" count={counts.transfers}/><Card icon={ClipboardList} title="Draft orders" count={counts.drafts}/><Card icon={Boxes} title="Purchase orders" count={counts.purchaseOrders}/>
          <Card icon={CreditCard} title="Gift cards" count={counts.giftCards}/><Card icon={ShoppingCart} title="Abandoned checkouts" count={counts.abandoned} tone={counts.abandoned ? 'attention' : 'neutral'}/><Card icon={UsersRound} title="Sales channels" count={counts.channels}/><Card icon={Truck} title="Webhooks" count={counts.webhooks}/>
        </div>
        <div className="card opsPanel"><div><h3>Quick actions</h3><p className="muted">Use the dedicated admin sections for full editing workflows.</p></div><div className="opsActions"><button className="btn" disabled={busy || counts.locations > 0} onClick={seedLocation}>{busy ? 'Creating…' : counts.locations ? 'Locations configured' : 'Create main location'}</button><a className="btn secondary" href="/admin/orders">Open orders</a><a className="btn secondary" href="/admin/inventory">Open inventory</a><a className="btn secondary" href="/admin/customers">Open customers</a></div></div>
      </>}

      {tab === 'inventory' && <div className="opsGrid wide"><div className="card opsPanel"><h3>Locations</h3><p className="muted">Physical stock locations used by inventory transfers and purchasing.</p><div className="opsList">{data.locations.map((x: any) => <div className="opsRow" key={x.id}><strong>{x.name}</strong><span className="statusPill success">{x.status}</span><span className="muted">{x.isDefault ? 'Default' : x.handle}</span></div>)}{!data.locations.length && <div className="empty">No locations configured yet.</div>}</div></div><div className="card opsPanel"><h3>Transfers</h3><p className="muted">Movement queue between locations.</p><div className="opsList">{data.transfers.slice(0, 12).map((x:any)=><div className="opsRow" key={x.id}><strong>{x.reference || x.id.slice(0,8)}</strong><span>{x.status}</span></div>)}{!data.transfers.length && <div className="empty">No transfers found.</div>}</div></div></div>}

      {tab === 'orders' && <div className="opsGrid wide"><div className="card opsPanel"><h3>Draft orders</h3><p className="muted">Orders created in the admin before becoming completed orders.</p><div className="opsList">{data.drafts.slice(0, 12).map((x:any)=><div className="opsRow" key={x.id}><strong>{x.orderNumber || x.id.slice(0,8)}</strong><span>{x.status}</span><span>{x.currency} {((x.grandTotal || 0)/100).toFixed(2)}</span></div>)}{!data.drafts.length && <div className="empty">No draft orders found.</div>}</div></div><div className="card opsPanel"><h3>Abandoned checkouts</h3><p className="muted">Recovery opportunities from incomplete carts.</p><div className="opsList">{data.abandoned.slice(0, 12).map((x:any)=><div className="opsRow" key={x.id}><strong>{x.email || 'Guest checkout'}</strong><span>{x.status}</span><span>{x.currency} {((x.subtotal || 0)/100).toFixed(2)}</span></div>)}{!data.abandoned.length && <div className="empty">No abandoned checkouts found.</div>}</div></div></div>}

      {tab === 'customers' && <div className="opsGrid wide"><div className="card opsPanel"><h3>Gift cards</h3><p className="muted">Balance and status overview.</p><div className="opsList">{data.giftCards.slice(0, 12).map((x:any)=><div className="opsRow" key={x.id}><strong>•••• {x.last4 || ''}</strong><span>{x.status}</span><span>{x.currency} {((x.balance || 0)/100).toFixed(2)}</span></div>)}{!data.giftCards.length && <div className="empty">No gift cards found.</div>}</div></div><div className="card opsPanel"><h3>Customer operations</h3><p className="muted">Tags, segments and store credit are available through the customer area.</p><div className="opsActions"><a className="btn" href="/admin/customers">Customers</a></div></div></div>}

      {tab === 'integrations' && <div className="opsGrid wide"><div className="card opsPanel"><h3>Sales channels</h3><div className="opsList">{data.channels.map((x:any)=><div className="opsRow" key={x.id}><strong>{x.name}</strong><span>{x.status}</span><span className="muted">{x.handle}</span></div>)}{!data.channels.length && <div className="empty">No sales channels configured.</div>}</div></div><div className="card opsPanel"><h3>API & webhooks</h3><p className="muted">Integration credentials and event endpoints.</p><div className="opsList">{data.credentials.map((x:any)=><div className="opsRow" key={x.id}><strong>{x.name}</strong><span>{x.status}</span><span className="muted">{x.keyPrefix}</span></div>)}{data.webhooks.map((x:any)=><div className="opsRow" key={x.id}><strong>{x.topic}</strong><span>{x.status}</span><span className="muted">{x.lastStatus || '—'}</span></div>)}{!data.credentials.length && !data.webhooks.length && <div className="empty">No credentials or webhooks configured.</div>}</div></div></div>}
    </>}
  </div>
}

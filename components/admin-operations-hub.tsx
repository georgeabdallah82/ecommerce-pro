'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, ClipboardList, CreditCard, FileEdit, MapPin, RefreshCw, RotateCcw, ShoppingCart, Truck, UsersRound } from 'lucide-react'
import styles from './admin-operations-hub.module.css'
import ui from './admin-ui.module.css'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

function Card({ icon: Icon, title, count, attention = false, href }: { icon: any; title: string; count: number | string; attention?: boolean; href?: string }) {
  const body = <><div className={styles.tileIcon}><Icon size={17}/></div><div><div className={`${ui.muted} ${styles.tileLabel}`}>{title}</div><strong className={styles.tileCount}>{count}</strong></div></>
  const className = `${ui.card} ${styles.tile} ${attention ? styles.tileAttention : ''}`
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>
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
      transfers: '/api/admin/inventory/transfers',
      drafts: '/api/admin/draft-orders',
      returns: '/api/admin/returns',
      purchaseOrders: '/api/admin/purchase-orders',
      orderEdits: '/api/admin/order-edits',
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
    returns: data.returns?.length || 0,
    purchaseOrders: data.purchaseOrders?.length || 0,
    orderEdits: data.orderEdits?.length || 0,
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

  return <div className={styles.page}>
    <div className={ui.sectionHead}><div><span className={ui.muted}>OPERATIONS</span><h1 className={ui.title}>Operations hub</h1><p className={ui.muted}>One control surface for the advanced commerce workflows behind your store.</p></div><button className={`${ui.btn} ${ui.btnSecondary}`} disabled={loading} onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className="opsTabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>

    {loading ? <div className={`${ui.card} ${styles.loading}`}>Loading operations…</div> : <>
      {tab === 'overview' && <>
        <div className={styles.grid}>
          <Card icon={MapPin} title="Locations" count={counts.locations}/><Card icon={Truck} title="Transfers" count={counts.transfers} href="/admin/inventory/transfers"/><Card icon={ClipboardList} title="Draft orders" count={counts.drafts} href="/admin/draft-orders"/><Card icon={Boxes} title="Purchase orders" count={counts.purchaseOrders} href="/admin/purchase-orders"/>
          <Card icon={RotateCcw} title="Returns" count={counts.returns} href="/admin/returns"/><Card icon={FileEdit} title="Order edits" count={counts.orderEdits} href="/admin/order-edits"/><Card icon={CreditCard} title="Gift cards" count={counts.giftCards} href="/admin/gift-cards"/><Card icon={ShoppingCart} title="Abandoned checkouts" count={counts.abandoned} attention={counts.abandoned > 0}/><Card icon={UsersRound} title="Sales channels" count={counts.channels}/><Card icon={Truck} title="Webhooks" count={counts.webhooks}/>
        </div>
        <div className={`${ui.card} ${styles.panel}`}><div><h3>Quick actions</h3><p className={ui.muted}>Use the dedicated admin sections for full editing workflows.</p></div><div className={styles.actions}><button className={ui.btn} disabled={busy || counts.locations > 0} onClick={seedLocation}>{busy ? 'Creating…' : counts.locations ? 'Locations configured' : 'Create main location'}</button><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/orders">Open orders</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/inventory">Open inventory</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/customers">Open customers</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/purchase-orders">Purchase orders</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/inventory/transfers">Transfers</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/order-edits">Order edits</a></div></div>
      </>}

      {tab === 'inventory' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><h3>Locations</h3><p className={ui.muted}>Physical stock locations used by inventory transfers and purchasing.</p><div className={styles.list}>{data.locations.map((x: any) => <div className={styles.row} key={x.id}><strong>{x.name}</strong><span className={`${ui.statusPill} ${ui.statusPillSuccess}`}>{x.status}</span><span className={ui.muted}>{x.isDefault ? 'Default' : x.handle}</span></div>)}{!data.locations.length && <div className="empty">No locations configured yet.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><h3>Transfers</h3><p className={ui.muted}>Movement queue between locations.</p><div className={styles.list}>{data.transfers.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>{x.reference || x.id.slice(0,8)}</strong><span>{x.status}</span></div>)}{!data.transfers.length && <div className="empty">No transfers found.</div>}</div></div></div>}

      {tab === 'orders' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Draft orders</h3><Link className={ui.textLink} href="/admin/draft-orders">Open drafts</Link></div><p className={ui.muted}>Orders created in the admin before becoming completed orders.</p><div className={styles.list}>{data.drafts.slice(0, 12).map((x:any)=><Link className={styles.row} href={`/admin/draft-orders/${x.id}`} key={x.id}><strong>{x.orderNumber || x.id.slice(0,8)}</strong><span>{x.status}</span><span>{x.currency} {((x.grandTotal || 0)/100).toFixed(2)}</span></Link>)}{!data.drafts.length && <div className="empty">No draft orders found.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Returns</h3><Link className={ui.textLink} href="/admin/returns">Open returns</Link></div><p className={ui.muted}>Return requests initiated against shipped or delivered orders.</p><div className={styles.list}>{data.returns.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>{x.order?.orderNumber || x.orderId.slice(0,8)}</strong><span>{x.status}</span><span>{x.order?.currency || ''} {((x.refundAmount || 0)/100).toFixed(2)}</span></div>)}{!data.returns.length && <div className="empty">No return requests found.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><h3>Abandoned checkouts</h3><p className={ui.muted}>Recovery opportunities from incomplete carts.</p><div className={styles.list}>{data.abandoned.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>{x.email || 'Guest checkout'}</strong><span>{x.status}</span><span>{x.currency} {((x.subtotal || 0)/100).toFixed(2)}</span></div>)}{!data.abandoned.length && <div className="empty">No abandoned checkouts found.</div>}</div></div></div>}

      {tab === 'customers' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Gift cards</h3><Link className={ui.textLink} href="/admin/gift-cards">Open gift cards</Link></div><p className={ui.muted}>Balance and status overview.</p><div className={styles.list}>{data.giftCards.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>•••• {x.last4 || ''}</strong><span>{x.status}</span><span>{x.currency} {((x.balance || 0)/100).toFixed(2)}</span></div>)}{!data.giftCards.length && <div className="empty">No gift cards found.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><h3>Customer operations</h3><p className={ui.muted}>Tags, segments and store credit are available through the customer area.</p><div className={styles.actions}><a className={ui.btn} href="/admin/customers">Customers</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/customer-segments">Segments</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/gift-cards">Gift cards</a></div></div></div>}

      {tab === 'integrations' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><h3>Sales channels</h3><div className={styles.list}>{data.channels.map((x:any)=><div className={styles.row} key={x.id}><strong>{x.name}</strong><span>{x.status}</span><span className={ui.muted}>{x.handle}</span></div>)}{!data.channels.length && <div className="empty">No sales channels configured.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><h3>API & webhooks</h3><p className={ui.muted}>Integration credentials and event endpoints.</p><div className={styles.list}>{data.credentials.map((x:any)=><div className={styles.row} key={x.id}><strong>{x.name}</strong><span>{x.status}</span><span className={ui.muted}>{x.keyPrefix}</span></div>)}{data.webhooks.map((x:any)=><div className={styles.row} key={x.id}><strong>{x.topic}</strong><span>{x.status}</span><span className={ui.muted}>{x.lastStatus || '—'}</span></div>)}{!data.credentials.length && !data.webhooks.length && <div className="empty">No credentials or webhooks configured.</div>}</div></div></div>}
    </>}
  </div>
}

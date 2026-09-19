'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Boxes, ClipboardList, CreditCard, FileEdit, MapPin, Plus, RefreshCw, RotateCcw, ShoppingCart, Truck, UsersRound } from 'lucide-react'
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

function AddToggle({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setOpen(true)}><Plus size={14}/> {label}</button>
  return <div className={styles.inlineForm}>{children(() => setOpen(false))}</div>
}

function LocationsPanel({ locations, onChange }: { locations: any[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(close: () => void) {
    if (!name.trim()) return
    setBusy(true); setError('')
    try {
      await api('/api/admin/locations', { method: 'POST', body: JSON.stringify({ name, phone: phone || undefined, isDefault }) })
      setName(''); setPhone(''); setIsDefault(false); close(); onChange()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create location') }
    finally { setBusy(false) }
  }

  async function toggleStatus(loc: any) {
    setError('')
    try { await api(`/api/admin/locations/${loc.id}`, { method: 'PATCH', body: JSON.stringify({ status: loc.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update location') }
  }

  async function makeDefault(loc: any) {
    setError('')
    try { await api(`/api/admin/locations/${loc.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update location') }
  }

  async function remove(loc: any) {
    if (!confirm(`Delete location "${loc.name}"?`)) return
    setError('')
    try { await api(`/api/admin/locations/${loc.id}`, { method: 'DELETE' }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete location') }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>Locations</h3>
    <p className={ui.muted}>Physical stock locations used by inventory transfers and purchasing.</p>
    <div className={styles.list}>
      {locations.map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.name}</strong>
          <span className={`${ui.statusPill} ${x.status === 'ACTIVE' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{x.status}</span>
          <span className={styles.rowMeta}>{x.isDefault ? 'Default' : x.handle}{x.phone ? ` · ${x.phone}` : ''}</span>
          <div className={styles.rowActions}>
            {!x.isDefault && <button type="button" className={ui.textButton} onClick={() => makeDefault(x)}>Make default</button>}
            <button type="button" className={ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
            <button type="button" className={`${ui.textButton} ${ui.textButtonDanger}`} onClick={() => remove(x)}>Delete</button>
          </div>
        </div>
      ))}
      {!locations.length && <div className="empty">No locations configured yet.</div>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className={styles.actions}>
      <AddToggle label="Add location">{close => <>
        <input className={ui.input} placeholder="Location name" value={name} onChange={e => setName(e.target.value)} autoFocus/>
        <input className={ui.input} placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}/>
        <label className={styles.checkboxField}><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}/> Set as default location</label>
        <div className={styles.actions}>
          <button type="button" className={ui.btn} disabled={busy || !name.trim()} onClick={() => create(close)}>{busy ? 'Creating…' : 'Create'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={close}>Cancel</button>
        </div>
      </>}</AddToggle>
    </div>
  </div>
}

function SalesChannelsPanel({ channels, onChange }: { channels: any[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(close: () => void) {
    if (!name.trim()) return
    setBusy(true); setError('')
    try { await api('/api/admin/sales-channels', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); close(); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create sales channel') }
    finally { setBusy(false) }
  }

  async function toggleStatus(channel: any) {
    setError('')
    try { await api('/api/admin/sales-channels', { method: 'PATCH', body: JSON.stringify({ id: channel.id, status: channel.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update sales channel') }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>Sales channels</h3>
    <p className={ui.muted}>Where products can be published for sale.</p>
    <div className={styles.list}>
      {channels.map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.name}</strong>
          <span className={`${ui.statusPill} ${x.status === 'ACTIVE' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{x.status}</span>
          <span className={styles.rowMeta}>{x.handle} · {x._count?.publications ?? 0} products</span>
          <div className={styles.rowActions}><button type="button" className={ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button></div>
        </div>
      ))}
      {!channels.length && <div className="empty">No sales channels configured.</div>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className={styles.actions}>
      <AddToggle label="Add sales channel">{close => <>
        <input className={ui.input} placeholder="Channel name (e.g. Instagram Shop)" value={name} onChange={e => setName(e.target.value)} autoFocus/>
        <div className={styles.actions}>
          <button type="button" className={ui.btn} disabled={busy || !name.trim()} onClick={() => create(close)}>{busy ? 'Creating…' : 'Create'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={close}>Cancel</button>
        </div>
      </>}</AddToggle>
    </div>
  </div>
}

const WEBHOOK_TOPICS = ['order.created', 'order.updated', 'order.fulfilled', 'product.updated', 'inventory.updated', 'customer.created']

function WebhooksPanel({ webhooks, onChange }: { webhooks: any[]; onChange: () => void }) {
  const [topic, setTopic] = useState(WEBHOOK_TOPICS[0])
  const [endpointUrl, setEndpointUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')

  async function create(close: () => void) {
    if (!endpointUrl.trim()) return
    setBusy(true); setError('')
    try {
      const { webhook } = await api('/api/admin/webhooks', { method: 'POST', body: JSON.stringify({ topic, endpointUrl }) })
      setEndpointUrl(''); close(); onChange()
      if (webhook?.secret) setRevealedSecret(webhook.secret)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create webhook') }
    finally { setBusy(false) }
  }

  async function toggleStatus(hook: any) {
    setError('')
    try { await api('/api/admin/webhooks', { method: 'PATCH', body: JSON.stringify({ id: hook.id, status: hook.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update webhook') }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>Webhooks</h3>
    <p className={ui.muted}>HTTPS endpoints notified when store events happen.</p>
    <div className={styles.list}>
      {webhooks.map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.topic}</strong>
          <span className={`${ui.statusPill} ${x.status === 'ACTIVE' ? ui.statusPillSuccess : ui.statusPillWarning}`}>{x.status}</span>
          <span className={styles.rowMeta} title={x.endpointUrl}>{x.endpointUrl}</span>
          <div className={styles.rowActions}><button type="button" className={ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button></div>
        </div>
      ))}
      {!webhooks.length && <div className="empty">No webhooks configured.</div>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {revealedSecret && <div className={styles.secretReveal}>
      <strong>Webhook signing secret</strong>
      <p className={ui.fieldHelp}>Copy this now — it won't be shown again. Use it to verify the <code>X-Webhook-Signature</code> header on incoming requests.</p>
      <code className={styles.secretValue}>{revealedSecret}</code>
      <div className={styles.actions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setRevealedSecret('')}>Done</button></div>
    </div>}
    <div className={styles.actions}>
      <AddToggle label="Add webhook">{close => <>
        <select className={ui.select} value={topic} onChange={e => setTopic(e.target.value)}>{WEBHOOK_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <input className={ui.input} placeholder="https://your-service.com/webhook" value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)}/>
        <div className={styles.actions}>
          <button type="button" className={ui.btn} disabled={busy || !endpointUrl.trim()} onClick={() => create(close)}>{busy ? 'Creating…' : 'Create'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={close}>Cancel</button>
        </div>
      </>}</AddToggle>
    </div>
  </div>
}

const CREDENTIAL_SCOPES = ['store.read', 'store.write', 'orders.read', 'orders.write', 'products.read', 'products.write']

function ApiCredentialsPanel({ credentials, onChange }: { credentials: any[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['store.read'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')

  function toggleScope(scope: string) {
    setScopes(s => s.includes(scope) ? s.filter(x => x !== scope) : [...s, scope])
  }

  async function create(close: () => void) {
    if (!name.trim()) return
    setBusy(true); setError('')
    try {
      const { secret } = await api('/api/admin/api-credentials', { method: 'POST', body: JSON.stringify({ name, scopes }) })
      setName(''); setScopes(['store.read']); close(); onChange()
      if (secret) setRevealedSecret(secret)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create API credential') }
    finally { setBusy(false) }
  }

  async function toggleStatus(cred: any) {
    setError('')
    try { await api('/api/admin/api-credentials', { method: 'PATCH', body: JSON.stringify({ id: cred.id, status: cred.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update API credential') }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>API credentials</h3>
    <p className={ui.muted}>Keys for external systems to call the store API.</p>
    <div className={styles.list}>
      {credentials.map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.name}</strong>
          <span className={`${ui.statusPill} ${x.status === 'ACTIVE' ? ui.statusPillSuccess : ui.statusPillDanger}`}>{x.status}</span>
          <span className={styles.rowMeta}>{x.keyPrefix}…</span>
          <div className={styles.rowActions}><button type="button" className={x.status === 'ACTIVE' ? `${ui.textButton} ${ui.textButtonDanger}` : ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Revoke' : 'Reactivate'}</button></div>
        </div>
      ))}
      {!credentials.length && <div className="empty">No API credentials configured.</div>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {revealedSecret && <div className={styles.secretReveal}>
      <strong>API key</strong>
      <p className={ui.fieldHelp}>Copy this now — it won't be shown again.</p>
      <code className={styles.secretValue}>{revealedSecret}</code>
      <div className={styles.actions}><button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setRevealedSecret('')}>Done</button></div>
    </div>}
    <div className={styles.actions}>
      <AddToggle label="Add API credential">{close => <>
        <input className={ui.input} placeholder="Credential name (e.g. Inventory sync)" value={name} onChange={e => setName(e.target.value)} autoFocus/>
        <div>
          <span className={ui.fieldLabel}>Scopes</span>
          <div className={styles.scopeGrid}>{CREDENTIAL_SCOPES.map(scope => (
            <label className={styles.checkboxField} key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)}/> {scope}</label>
          ))}</div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={ui.btn} disabled={busy || !name.trim()} onClick={() => create(close)}>{busy ? 'Creating…' : 'Create'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={close}>Cancel</button>
        </div>
      </>}</AddToggle>
    </div>
  </div>
}

function AbandonedCheckoutsPanel({ checkouts, onChange }: { checkouts: any[]; onChange: () => void }) {
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function sendRecovery(id: string) {
    setSendingId(id); setError('')
    try { await api('/api/admin/abandoned-checkouts/send-email', { method: 'POST', body: JSON.stringify({ id }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to send recovery email') }
    finally { setSendingId(null) }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>Abandoned checkouts</h3>
    <p className={ui.muted}>Recovery opportunities from incomplete carts.</p>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className={styles.list}>
      {checkouts.slice(0, 12).map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.email || 'Guest checkout'}</strong>
          <span className={`${ui.statusPill} ${x.status === 'OPEN' ? ui.statusPillWarning : ui.statusPillSuccess}`}>{x.status}</span>
          <span className={styles.rowMeta}>{x.currency} {((x.subtotal || 0) / 100).toFixed(2)}</span>
          <div className={styles.rowActions}>
            {x.status === 'OPEN' && x.email && <button type="button" className={ui.textButton} disabled={sendingId === x.id} onClick={() => sendRecovery(x.id)}>{sendingId === x.id ? 'Sending…' : 'Send recovery email'}</button>}
          </div>
        </div>
      ))}
    </div>
    {!checkouts.length && <div className="empty">No abandoned checkouts found.</div>}
  </div>
}

export default function AdminOperationsHub() {
  const [data, setData] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedOnce = useRef(false)

  async function load() {
    // Only the very first load shows the full-page spinner. A later refresh
    // (after creating/toggling something in one of the entity panels below)
    // must NOT flip `loading` back to true -- that swaps out the whole
    // `{loading ? <Spinner/> : <tab content>}` branch, unmounting every panel
    // and losing their local state, including a just-created webhook/API
    // credential's one-time-reveal secret before anyone can read it.
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    setError('')
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
    setRefreshing(false)
    hasLoadedOnce.current = true
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
    <div className={ui.sectionHead}><div><span className={ui.muted}>OPERATIONS</span><h1 className={ui.title}>Operations hub</h1><p className={ui.muted}>One control surface for the advanced commerce workflows behind your store.</p></div><button className={`${ui.btn} ${ui.btnSecondary}`} disabled={loading || refreshing} onClick={load}><RefreshCw size={15}/> Refresh</button></div>
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

      {tab === 'inventory' && <div className={`${styles.grid} ${styles.wide}`}><LocationsPanel locations={data.locations || []} onChange={load}/><div className={`${ui.card} ${styles.panel}`}><h3>Transfers</h3><p className={ui.muted}>Movement queue between locations.</p><div className={styles.list}>{data.transfers.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>{x.reference || x.id.slice(0,8)}</strong><span>{x.status}</span></div>)}{!data.transfers.length && <div className="empty">No transfers found.</div>}</div></div></div>}

      {tab === 'orders' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Draft orders</h3><Link className={ui.textLink} href="/admin/draft-orders">Open drafts</Link></div><p className={ui.muted}>Orders created in the admin before becoming completed orders.</p><div className={styles.list}>{data.drafts.slice(0, 12).map((x:any)=><Link className={styles.row} href={`/admin/draft-orders/${x.id}`} key={x.id}><strong>{x.orderNumber || x.id.slice(0,8)}</strong><span>{x.status}</span><span>{x.currency} {((x.grandTotal || 0)/100).toFixed(2)}</span></Link>)}{!data.drafts.length && <div className="empty">No draft orders found.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Returns</h3><Link className={ui.textLink} href="/admin/returns">Open returns</Link></div><p className={ui.muted}>Return requests initiated against shipped or delivered orders.</p><div className={styles.list}>{data.returns.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>{x.order?.orderNumber || x.orderId.slice(0,8)}</strong><span>{x.status}</span><span>{x.order?.currency || ''} {((x.refundAmount || 0)/100).toFixed(2)}</span></div>)}{!data.returns.length && <div className="empty">No return requests found.</div>}</div></div><AbandonedCheckoutsPanel checkouts={data.abandoned || []} onChange={load}/></div>}

      {tab === 'customers' && <div className={`${styles.grid} ${styles.wide}`}><div className={`${ui.card} ${styles.panel}`}><div className="inline" style={{justifyContent:'space-between'}}><h3>Gift cards</h3><Link className={ui.textLink} href="/admin/gift-cards">Open gift cards</Link></div><p className={ui.muted}>Balance and status overview.</p><div className={styles.list}>{data.giftCards.slice(0, 12).map((x:any)=><div className={styles.row} key={x.id}><strong>•••• {x.last4 || ''}</strong><span>{x.status}</span><span>{x.currency} {((x.balance || 0)/100).toFixed(2)}</span></div>)}{!data.giftCards.length && <div className="empty">No gift cards found.</div>}</div></div><div className={`${ui.card} ${styles.panel}`}><h3>Customer operations</h3><p className={ui.muted}>Tags, segments and store credit are available through the customer area.</p><div className={styles.actions}><a className={ui.btn} href="/admin/customers">Customers</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/customer-segments">Segments</a><a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/gift-cards">Gift cards</a></div></div></div>}

      {tab === 'integrations' && <div className={`${styles.grid} ${styles.wide}`}><SalesChannelsPanel channels={data.channels || []} onChange={load}/><WebhooksPanel webhooks={data.webhooks || []} onChange={load}/><ApiCredentialsPanel credentials={data.credentials || []} onChange={load}/></div>}
    </>}
  </div>
}

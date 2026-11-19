'use client'

import { useEffect, useRef, useState } from 'react'
import Link from '@/components/admin-link'
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import styles from './admin-operations-hub.module.css'
import ui from './admin-ui.module.css'
import { useConfirm } from './admin-confirm'
import { fetchRead } from '@/lib/retry-fetch'

// Reads the host stopped are tried again (lib/retry-fetch.ts); saves go once.
async function api(path: string, init?: RequestInit) {
  const r = await fetchRead(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
  return data
}

function AddToggle({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setOpen(true)}><Plus size={14}/> {label}</button>
  return <div className={styles.inlineForm}>{children(() => setOpen(false))}</div>
}

function LocationsPanel({ locations, onChange }: { locations: any[]; onChange: () => void }) {
  const confirm = useConfirm()
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
    if (loc.status === 'ACTIVE' && !(await confirm({ title: `Deactivate ${loc.name}?`, message: 'Stock at this location stops being used for new orders until you activate it again.', confirmLabel: 'Deactivate' }))) return
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
    if (!(await confirm({ title: `Delete location "${loc.name}"?`, message: 'This cannot be undone.', confirmLabel: 'Delete location' }))) return
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
            <button type="button" className={x.status === 'ACTIVE' ? `${ui.textButton} ${ui.textButtonDanger}` : ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
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
  const confirm = useConfirm()
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
    if (channel.status === 'ACTIVE' && !(await confirm({ title: `Deactivate ${channel.name}?`, message: 'Products published only to this channel stop being available there.', confirmLabel: 'Deactivate' }))) return
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
          <div className={styles.rowActions}><button type="button" className={x.status === 'ACTIVE' ? `${ui.textButton} ${ui.textButtonDanger}` : ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button></div>
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
  const confirm = useConfirm()
  const [topic, setTopic] = useState(WEBHOOK_TOPICS[0])
  const [endpointUrl, setEndpointUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')
  const [retryingId, setRetryingId] = useState('')

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
    if (hook.status === 'ACTIVE' && !(await confirm({ title: 'Disable this webhook?', message: 'It stops receiving events until you enable it again.', confirmLabel: 'Disable webhook' }))) return
    setError('')
    try { await api('/api/admin/webhooks', { method: 'PATCH', body: JSON.stringify({ id: hook.id, status: hook.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update webhook') }
  }

  async function retry(hook: any) {
    setError(''); setRetryingId(hook.id)
    try { await api(`/api/admin/webhooks/${hook.id}/redeliver`, { method: 'POST' }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to redeliver webhook') }
    finally { setRetryingId('') }
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
          {x.lastSentAt && (
            <span className={`${ui.statusPill} ${x.lastError ? ui.statusPillDanger : ui.statusPillSuccess}`} title={x.lastError || `Last delivered ${new Date(x.lastSentAt).toLocaleString()}`}>
              {x.lastError ? `Failed: ${x.lastError}` : `Delivered ${new Date(x.lastSentAt).toLocaleString()}`}
            </span>
          )}
          <div className={styles.rowActions}>
            {x.hasFailedDelivery && <button type="button" className={ui.textButton} disabled={retryingId === x.id} onClick={() => retry(x)}>{retryingId === x.id ? 'Retrying…' : 'Retry delivery'}</button>}
            <button type="button" className={x.status === 'ACTIVE' ? `${ui.textButton} ${ui.textButtonDanger}` : ui.textButton} onClick={() => toggleStatus(x)}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
      ))}
      {!webhooks.length && <div className="empty">No webhooks configured.</div>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    {revealedSecret && <div className={styles.secretReveal}>
      <strong>Webhook signing secret</strong>
      <p className={ui.fieldHelp}>Copy this now — it won't be shown again. Use it to verify the <code>X-Webhook-Signature</code> header (the HMAC-SHA256 of the body), or <code>X-Webhook-Signature-V2</code>: the HMAC-SHA256 of <code>X-Webhook-Timestamp</code>, a dot and the body, so a delivery replayed later can be refused.</p>
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
  const confirm = useConfirm()
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
    if (cred.status === 'ACTIVE' && !(await confirm({ title: `Revoke ${cred.name || 'this API key'}?`, message: 'Anything using this key stops working immediately.', confirmLabel: 'Revoke key' }))) return
    setError('')
    try { await api('/api/admin/api-credentials', { method: 'PATCH', body: JSON.stringify({ id: cred.id, status: cred.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE' }) }); onChange() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update API credential') }
  }

  return <div className={`${ui.card} ${styles.panel}`}>
    <h3>API credentials</h3>
    <p className={ui.muted}>Generate and manage keys for external systems. A key with the <code>products.read</code> scope can call <code>GET /api/v1/products</code> with an <code>Authorization: Bearer</code> header; other scopes are recorded but not yet checked by any route.</p>
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
          <p className={ui.fieldHelp}>Recorded for when API access is wired up -- not enforced yet.</p>
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

const REMINDER_KEYS = { enabled: 'abandoned.autoSend', delayHours: 'abandoned.delayHours', maxAgeHours: 'abandoned.maxAgeHours', dailyLimit: 'abandoned.dailyLimit' }

// Automatic cart reminders (lib/cart-reminders.ts): off until the owner turns them on here.
export function CartReminderSettings() {
  const [values, setValues] = useState({ enabled: false, delayHours: '3', maxAgeHours: '48', dailyLimit: '20' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    api('/api/admin/settings').then((rows: { key: string; value: string }[]) => {
      const get = (key: string) => rows.find(r => r.key === key)?.value
      setValues(v => ({ enabled: get(REMINDER_KEYS.enabled) === 'true', delayHours: get(REMINDER_KEYS.delayHours) || v.delayHours, maxAgeHours: get(REMINDER_KEYS.maxAgeHours) || v.maxAgeHours, dailyLimit: get(REMINDER_KEYS.dailyLimit) || v.dailyLimit }))
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])
  async function save() {
    setSaving(true); setNote('')
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings: { [REMINDER_KEYS.enabled]: String(values.enabled), [REMINDER_KEYS.delayHours]: values.delayHours, [REMINDER_KEYS.maxAgeHours]: values.maxAgeHours, [REMINDER_KEYS.dailyLimit]: values.dailyLimit } }) })
      setNote(values.enabled ? 'Saved. Reminders are on.' : 'Saved. Reminders are off.')
    } catch (e) { setNote(e instanceof Error ? e.message : 'Unable to save') }
    finally { setSaving(false) }
  }
  if (!loaded) return null
  return <div className={styles.reminderBox}>
    <label className={styles.reminderToggle}><input type="checkbox" checked={values.enabled} onChange={e => setValues({ ...values, enabled: e.target.checked })} /> <strong>Email one reminder automatically</strong></label>
    <p className={ui.muted}>To shoppers who typed their email at checkout and left without ordering. Only one per checkout, never after they ordered or unsubscribed, never twice in 7 days to the same email.</p>
    <div className={styles.reminderFields}>
      <label className={ui.fieldLabel}>Wait after they leave<select className={ui.select} value={values.delayHours} onChange={e => setValues({ ...values, delayHours: e.target.value })}>{['1', '2', '3', '6', '12', '24'].map(h => <option key={h} value={h}>{h} hour{h === '1' ? '' : 's'}</option>)}</select></label>
      <label className={ui.fieldLabel}>Too late after<select className={ui.select} value={values.maxAgeHours} onChange={e => setValues({ ...values, maxAgeHours: e.target.value })}>{['24', '48', '72'].map(h => <option key={h} value={h}>{h} hours</option>)}</select></label>
      <label className={ui.fieldLabel}>At most per day<select className={ui.select} value={values.dailyLimit} onChange={e => setValues({ ...values, dailyLimit: e.target.value })}>{['5', '10', '20', '50'].map(n => <option key={n} value={n}>{n} emails</option>)}</select></label>
      <button type="button" className={ui.btn} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
    </div>
    {note && <p className={ui.muted}>{note}</p>}
  </div>
}

function reminderText(x: any) {
  const when = x.reminderAt ? new Date(x.reminderAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  if (x.reminderState === 'sent') return `Reminder sent ${when}${x.reminderNote ? ` (${x.reminderNote})` : ''}`
  if (x.reminderState === 'skipped') return `No reminder: ${x.reminderNote || 'not eligible'}`
  if (x.reminderState === 'failed') return 'Reminder could not be sent'
  if (x.reminderState === 'sending') return 'Reminder being sent'
  return ''
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
    <CartReminderSettings />
    {error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
    <div className={styles.list}>
      {checkouts.slice(0, 12).map((x: any) => (
        <div className={styles.entityRow} key={x.id}>
          <strong>{x.email || 'Guest checkout'}</strong>
          <span className={`${ui.statusPill} ${x.status === 'OPEN' ? ui.statusPillWarning : ui.statusPillSuccess}`}>{x.status}</span>
          <span className={styles.rowMeta}>{x.currency} {((x.subtotal || 0) / 100).toFixed(2)}{reminderText(x) ? ` · ${reminderText(x)}` : ''}</span>
          <div className={styles.rowActions}>
            {x.status === 'OPEN' && x.email && x.reminderState !== 'sent' && <button type="button" className={ui.textButton} disabled={sendingId === x.id} onClick={() => sendRecovery(x.id)}>{sendingId === x.id ? 'Sending…' : 'Send recovery email'}</button>}
          </div>
        </div>
      ))}
    </div>
    {!checkouts.length && <div className="empty">No abandoned checkouts found.</div>}
  </div>
}

// What this page loads. Orders, returns, transfers, gift cards and the rest have their own pages
// in the sidebar, so this page links to them instead of repeating them.
const ENDPOINTS: Record<string, { path: string; label: string }> = {
  locations: { path: '/api/admin/locations', label: 'locations' },
  abandoned: { path: '/api/admin/abandoned-checkouts', label: 'unfinished checkouts' },
  channels: { path: '/api/admin/sales-channels', label: 'sales channels' },
  webhooks: { path: '/api/admin/webhooks', label: 'webhooks' },
  credentials: { path: '/api/admin/api-credentials', label: 'API keys' },
}
const OTHER_WORKFLOWS = [
  { href: '/admin/inventory/transfers', label: 'Transfers' },
  { href: '/admin/purchase-orders', label: 'Purchase orders' },
  { href: '/admin/draft-orders', label: 'Draft orders' },
  { href: '/admin/returns', label: 'Returns' },
  { href: '/admin/order-edits', label: 'Order edits' },
  { href: '/admin/gift-cards', label: 'Gift cards' },
  { href: '/admin/customer-segments', label: 'Customer segments' },
]

function listOf(value: any): any[] {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.rows)) return value.rows
  return []
}

export default function AdminOperationsHub() {
  const [data, setData] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const hasLoadedOnce = useRef(false)

  async function load() {
    // Only the first load shows the placeholder. A refresh keeps the panels mounted, so a key or
    // webhook secret that was just created stays on screen for the owner to copy.
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    const failed: string[] = []
    const entries = await Promise.all(Object.entries(ENDPOINTS).map(async ([key, { path, label }]) => {
      try { return [key, listOf(await api(path))] as const }
      catch { failed.push(label); return [key, []] as const }
    }))
    setData(Object.fromEntries(entries))
    setError(failed.length ? `Could not load ${failed.join(', ')}.` : '')
    setLoading(false)
    setRefreshing(false)
    hasLoadedOnce.current = true
  }

  useEffect(() => { load() }, [])

  async function seedLocation() {
    setBusy(true); setError('')
    try { await api('/api/admin/locations', { method: 'POST', body: JSON.stringify({ name: 'Main location', isDefault: true }) }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to create location') }
    finally { setBusy(false) }
  }

  const locations = data.locations || []
  const webhooks = data.webhooks || []
  const abandoned = data.abandoned || []

  // Only things someone has to act on. Each one links to where the action happens.
  const attention: { id: string; title: string; detail: string; action: React.ReactNode }[] = []
  if (!loading && !locations.length) attention.push({
    id: 'no-location', title: 'No stock location yet', detail: 'Orders and transfers need a location to take stock from.',
    action: <button type="button" className={ui.btn} disabled={busy} onClick={seedLocation}>{busy ? 'Creating…' : 'Create main location'}</button>,
  })
  const offLocations = locations.filter((x: any) => x.status !== 'ACTIVE').length
  if (offLocations) attention.push({ id: 'off-locations', title: `${offLocations} ${offLocations === 1 ? 'location is' : 'locations are'} turned off`, detail: 'Stock there is not used for new orders.', action: <a className={ui.textLink} href="#setup">Review</a> })
  const failedHooks = webhooks.filter((x: any) => x.hasFailedDelivery).length
  if (failedHooks) attention.push({ id: 'failed-hooks', title: `${failedHooks} ${failedHooks === 1 ? 'webhook failed' : 'webhooks failed'} to deliver`, detail: 'The receiving service did not accept the last event.', action: <a className={ui.textLink} href="#developers">Retry</a> })
  const recoverable = abandoned.filter((x: any) => x.status === 'OPEN' && x.email && x.reminderState !== 'sent').length
  if (recoverable) attention.push({ id: 'recoverable', title: `${recoverable} unfinished ${recoverable === 1 ? 'checkout' : 'checkouts'} can get a recovery email`, detail: 'Shoppers who left after typing their email.', action: <a className={ui.textLink} href="#automation">Send</a> })

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <h1 className={ui.title}>Operations</h1>
        <p className={ui.muted}>Locations, sales channels, automatic emails and developer access.</p>
      </div>
      <button className={`${ui.btn} ${ui.btnSecondary}`} disabled={loading || refreshing} onClick={load}><RefreshCw size={15}/> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error} <button type="button" className={ui.textButton} disabled={loading || refreshing} onClick={load}>{refreshing ? 'Trying…' : 'Try again'}</button></div>}

    {loading ? <div className={`${ui.card} ${styles.loading}`}>Loading operations…</div> : <>
      <section className={`${ui.card} ${styles.attention}`} aria-labelledby="ops-attention">
        <h2 id="ops-attention"><AlertTriangle size={16} aria-hidden="true"/> Needs attention{attention.length > 0 && <span>{attention.length}</span>}</h2>
        {attention.length
          ? <ul>{attention.map(item => <li key={item.id}><div><strong>{item.title}</strong><span className={ui.muted}>{item.detail}</span></div>{item.action}</li>)}</ul>
          : <p className={ui.muted}>Nothing needs your attention right now.</p>}
      </section>

      <section id="setup" className={styles.section} aria-labelledby="ops-setup">
        <h2 id="ops-setup">Setup</h2>
        <p className={ui.muted}>Where stock is kept and where products are sold.</p>
        <div className={styles.twoCol}>
          <LocationsPanel locations={locations} onChange={load}/>
          <SalesChannelsPanel channels={data.channels || []} onChange={load}/>
        </div>
      </section>

      <section id="automation" className={styles.section} aria-labelledby="ops-automation">
        <h2 id="ops-automation">Automation</h2>
        <p className={ui.muted}>Emails sent automatically or on request for unfinished checkouts.</p>
        <AbandonedCheckoutsPanel checkouts={abandoned} onChange={load}/>
      </section>

      <section id="developers" className={styles.section} aria-labelledby="ops-developers">
        <h2 id="ops-developers">Developers</h2>
        <p className={ui.muted}>Connect other systems to your store.</p>
        <div className={styles.twoCol}>
          <WebhooksPanel webhooks={webhooks} onChange={load}/>
          <ApiCredentialsPanel credentials={data.credentials || []} onChange={load}/>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ops-other">
        <h2 id="ops-other">Other workflows</h2>
        <p className={ui.muted}>These have their own pages in the sidebar.</p>
        <div className={styles.links}>{OTHER_WORKFLOWS.map(link => <Link key={link.href} href={link.href} className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`}>{link.label}</Link>)}</div>
      </section>
    </>}
  </div>
}

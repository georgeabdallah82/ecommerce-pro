'use client'

import { useEffect, useState } from 'react'
import { Bell, Check, Send, Smartphone } from 'lucide-react'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'
import s from './admin-marketing.module.css'

export default function PushCampaignAdmin() {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; skipped: boolean } | null>(null)
  // The storefront popup switch and how many devices said yes (/api/admin/marketing/push-settings).
  const [visitors, setVisitors] = useState<{ askVisitors: boolean; subscribers: number; configured: boolean } | null>(null)
  const [savingSwitch, setSavingSwitch] = useState(false)
  const ready = !!title.trim() && !!body.trim()

  useEffect(() => {
    let live = true
    fetch('/api/admin/marketing/push-settings', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (live && data) setVisitors(data) })
      .catch(() => undefined)
    return () => { live = false }
  }, [lastResult])

  async function toggleAskVisitors() {
    if (!visitors) return
    const next = !visitors.askVisitors
    setSavingSwitch(true)
    try {
      const res = await fetch('/api/admin/marketing/push-settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ askVisitors: next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save')
      setVisitors(v => v ? { ...v, askVisitors: next } : v)
      toast(next ? 'Visitors will be asked to turn on notifications.' : 'The website popup is off.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Unable to save', 'error')
    } finally { setSavingSwitch(false) }
  }

  async function send() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/marketing/push-campaign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body, url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to send campaign')
      setLastResult(data)
      if (data.skipped) toast('Push is not configured on the server.', 'error')
      else { toast(`Sent to ${data.sent} subscriber${data.sent === 1 ? '' : 's'}${data.failed ? ` (${data.failed} failed)` : ''}.`); setTitle(''); setBody(''); setUrl('') }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Unable to send campaign', 'error')
    } finally { setBusy(false); setConfirming(false) }
  }

  return <div className={s.workspace}>
    <section className={`${ui.card} ${s.panel}`}>
      <h2 className={s.panelTitle}>Compose</h2>
      <p className={s.panelText}>Keep it short: phones cut long titles and messages.</p>
      <div className={s.field}>
        <label className={ui.fieldLabel}>Title <span className={s.counter}>{title.length}/120</span></label>
        <input className={ui.input} value={title} onChange={e => { setTitle(e.target.value); setConfirming(false) }} placeholder="Weekend sale is live" maxLength={120} />
      </div>
      <div className={s.field}>
        <label className={ui.fieldLabel}>Message <span className={s.counter}>{body.length}/500</span></label>
        <textarea className={ui.textarea} value={body} onChange={e => { setBody(e.target.value); setConfirming(false) }} placeholder="20% off everything through Sunday." maxLength={500} rows={5} />
      </div>
      <div className={s.field}>
        <label className={ui.fieldLabel}>Link (optional)</label>
        <input className={ui.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="/collections/sale" />
        <span className={ui.fieldHelp}>Relative path opened when a customer taps the notification. Defaults to the homepage.</span>
      </div>
      {confirming ? (
        <div className={s.confirmRow} role="alertdialog" aria-label="Confirm send">
          <span>Send this notification to {visitors ? `${visitors.subscribers} device${visitors.subscribers === 1 ? '' : 's'}` : 'every subscribed device'} now? It can&apos;t be recalled.</span>
          <button type="button" className={ui.btn} onClick={send} disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Yes, send now'}</button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
        </div>
      ) : (
        <button type="button" className={`${ui.btn} ${ui.btnWide}`} style={{ marginTop: 16 }} onClick={() => setConfirming(true)} disabled={!ready}>
          <Send size={15} /> Send to subscribed customers{visitors ? ` (${visitors.subscribers})` : ''}
        </button>
      )}
      {lastResult && !lastResult.skipped && (
        <p className={ui.fieldHelp} style={{ marginTop: 10 }}>Last send: {lastResult.sent} delivered, {lastResult.failed} failed.</p>
      )}
    </section>

    <aside className={s.side}>
      <section className={`${ui.card} ${s.panel}`}>
        <div className={s.switchRow}>
          <div>
            <h2 className={s.panelTitle}>Ask visitors on the website</h2>
            <p className={s.panelText}>A few seconds after someone opens your store, a small box asks if they want offers and order updates. &ldquo;Not now&rdquo; hides it for 30 days. No account needed.</p>
          </div>
          <button type="button" role="switch" aria-checked={!!visitors?.askVisitors} aria-label="Ask visitors on the website" disabled={!visitors || savingSwitch} className={`${s.switch} ${visitors?.askVisitors ? s.switchOn : ''}`} onClick={toggleAskVisitors}><i /></button>
        </div>
        <div className={s.subscriberCount}><Smartphone size={16} /> {visitors ? <><strong>{visitors.subscribers}</strong> device{visitors.subscribers === 1 ? '' : 's'} will receive your notifications</> : 'Counting devices…'}</div>
        {visitors && !visitors.configured && <p className={ui.fieldHelp} style={{ marginTop: 8 }}>Notifications aren&apos;t set up on the server (VAPID keys), so nothing can be sent yet.</p>}
      </section>
      <section className={`${ui.card} ${s.panel}`}>
        <h2 className={s.panelTitle}>Preview</h2>
        <p className={s.panelText}>Roughly how it appears on a customer&apos;s phone.</p>
        <div className={s.phone}>
          <div className={s.notification}>
            <span className={s.notificationIcon}><Bell size={16} /></span>
            <div>
              <div className={s.notificationMeta}><span>Your store</span><span>now</span></div>
              <strong className={title.trim() ? undefined : s.placeholder}>{title.trim() || 'Notification title'}</strong>
              <p className={body.trim() ? undefined : s.placeholder}>{body.trim() || 'Your message appears here.'}</p>
            </div>
          </div>
        </div>
      </section>
      <section className={`${ui.card} ${s.panel}`}>
        <h2 className={s.panelTitle}>Who receives it</h2>
        <ul className={s.checklist}>
          <li><Check size={14} /> Everyone who said yes: from the website popup or their account page, on Android phones and computers.</li>
          <li><Check size={14} /> Sent once, right away. There is no scheduling or undo.</li>
          <li><Check size={14} /> Tapping it opens the link above, or your homepage.</li>
        </ul>
      </section>
    </aside>
  </div>
}

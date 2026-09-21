'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'

export default function PushCampaignAdmin() {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; skipped: boolean } | null>(null)

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
    } finally { setBusy(false) }
  }

  return <div className={ui.card} style={{ padding: 20, maxWidth: 560 }}>
    <label className={ui.fieldLabel}>Title</label>
    <input className={ui.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekend sale is live" maxLength={120} />
    <label className={ui.fieldLabel} style={{ marginTop: 14 }}>Message</label>
    <textarea className={ui.textarea} value={body} onChange={e => setBody(e.target.value)} placeholder="20% off everything through Sunday." maxLength={500} rows={4} />
    <label className={ui.fieldLabel} style={{ marginTop: 14 }}>Link (optional)</label>
    <input className={ui.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="/collections/sale" />
    <span className={ui.fieldHelp}>Relative path opened when a customer taps the notification. Defaults to the homepage.</span>
    <button type="button" className={`${ui.btn} ${ui.btnWide}`} style={{ marginTop: 16 }} onClick={send} disabled={busy || !title.trim() || !body.trim()}>
      <Send size={15} /> {busy ? 'Sending…' : 'Send to subscribed customers'}
    </button>
    {lastResult && !lastResult.skipped && (
      <p className={ui.fieldHelp} style={{ marginTop: 10 }}>Last send: {lastResult.sent} delivered, {lastResult.failed} failed.</p>
    )}
  </div>
}

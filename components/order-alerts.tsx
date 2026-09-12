'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import ui from './admin-ui.module.css'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

export default function OrderAlerts({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [state, setState] = useState<'hidden' | 'disabled' | 'enabled'>('hidden')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function inspect() {
      if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
      try {
        const statusResponse = await fetch('/api/admin/notifications/push', { cache: 'no-store' })
        const status = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) throw new Error(status.error || 'Unable to check push subscription')
        if (!cancelled) setState(status.subscribed ? 'enabled' : 'disabled')
      } catch {
        if (!cancelled) setState('disabled')
      }
    }
    void inspect()
    return () => { cancelled = true }
  }, [vapidPublicKey])

  async function enable() {
    if (!vapidPublicKey) {
      setMessage('Order alerts are not configured on the server.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('This browser does not support push notifications.')
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // A subscription is tied to the VAPID application key used when it was created.
      // Re-create it so a subscription left over from a previous VAPID key cannot be reused.
      const existing = await registration.pushManager.getSubscription()
      if (existing) await existing.unsubscribe().catch(() => undefined)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const response = await fetch('/api/admin/notifications/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.subscribed !== true) throw new Error(data.error || 'Unable to verify order alerts on the server')
      setState('enabled')
      setMessage('Order alerts enabled on this device.')
    } catch (e) {
      setState('disabled')
      setMessage(e instanceof Error ? e.message : 'Unable to enable notifications')
    } finally { setBusy(false) }
  }

  async function test() {
    setBusy(true)
    setMessage('')
    try {
      const statusResponse = await fetch('/api/admin/notifications/push', { cache: 'no-store' })
      const status = await statusResponse.json().catch(() => ({}))
      if (!statusResponse.ok) throw new Error(status.error || 'Unable to check push subscription')
      if (!status.subscribed) {
        setState('disabled')
        throw new Error('This device is not subscribed to order alerts. Enable alerts first.')
      }
      const response = await fetch('/api/admin/notifications/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send test notification')
      if (!data.sent) {
        setState('disabled')
        throw new Error(data.skipped
          ? 'Push is not configured on the server.'
          : 'The push subscription could not be reached. Enable alerts again on this device.')
      }
      setMessage('Test notification sent.')
    } catch (e) {
      setState('disabled')
      setMessage(e instanceof Error ? e.message : 'Test failed')
    } finally { setBusy(false) }
  }

  if (state === 'hidden') return null
  return (
    <div className="orderAlertsWrap">
      <button
        type="button"
        className="orderAlertsBtn"
        onClick={enable}
        disabled={busy || state === 'enabled'}
        title={state === 'enabled' ? 'Order alerts are enabled on this device' : 'Enable new-order notifications on this device'}
        data-enabled={state === 'enabled' ? 'true' : 'false'}
      >
        <Bell size={14} />
        <span>{busy ? 'Working…' : state === 'enabled' ? 'Order alerts on' : 'Enable order alerts'}</span>
      </button>
      {state === 'enabled' && <button type="button" className="orderAlertsTest" onClick={test} disabled={busy}>Test alert</button>}
      {message && <span className={`orderAlertsMsg ${ui.muted}`} role="status">{message}</span>}
      <style jsx>{`
        .orderAlertsWrap{position:relative;display:flex;align-items:center;gap:6px;justify-content:flex-end}
        .orderAlertsBtn{display:flex;align-items:center;gap:6px;pointer-events:auto;touch-action:manipulation;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:999px;padding:0 11px;height:38px;font-size:12px;font-weight:700;color:var(--admin-ink-soft);cursor:pointer;white-space:nowrap}
        .orderAlertsBtn[data-enabled='true']{background:var(--admin-accent-soft);border-color:var(--admin-accent);color:var(--admin-accent-strong)}
        .orderAlertsBtn:disabled{cursor:default}
        .orderAlertsTest{pointer-events:auto;touch-action:manipulation;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:999px;padding:0 11px;height:38px;font-size:12px;font-weight:700;color:var(--admin-ink-soft);cursor:pointer;white-space:nowrap}
        /* Absolutely positioned rather than an inline flex sibling: the topbar
           that hosts this component has a fixed height with default (visible)
           overflow, so a wrapped inline message doesn't grow the header -- it
           spills straight through it and overlaps the page content underneath.
           Floating it below the button keeps the header's box intact no
           matter how long the message is. */
        .orderAlertsMsg{position:absolute;top:100%;right:0;margin-top:8px;z-index:1;display:block;width:max-content;max-width:240px;padding:8px 10px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);box-shadow:var(--admin-shadow-md, 0 8px 24px rgba(0,0,0,.12));font-size:11px;line-height:1.4;text-align:left}
        @media(max-width:1100px){
          .orderAlertsTest{display:none}
          .orderAlertsBtn{width:38px;height:38px;padding:0;justify-content:center;border-radius:10px}
          .orderAlertsBtn span{display:none}
        }
        @media(max-width:560px){
          .orderAlertsBtn{width:36px;height:36px}
        }
      `}</style>
    </div>
  )
}

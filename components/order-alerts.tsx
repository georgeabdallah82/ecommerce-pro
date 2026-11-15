'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { sameApplicationServerKey, urlBase64ToUint8Array } from '@/lib/push-opt-in'
import ui from './admin-ui.module.css'
import { fetchRead } from '@/lib/retry-fetch'

// This browser's own push subscription, if it has one.
async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) || null
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
        // "On" only when THIS device's subscription is registered for this staff member: alerts
        // turned on from another device (or the old workers.dev address) used to show as on here
        // while this device got nothing.
        const subscription = await currentSubscription()
        if (!subscription || Notification.permission !== 'granted') { if (!cancelled) setState('disabled'); return }
        const statusResponse = await fetchRead(`/api/admin/notifications/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, { cache: 'no-store' })
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

      // A subscription is tied to the VAPID key it was made with: reuse this browser's one when
      // the key matches (the store's customer notifications share it, and replacing it would cut
      // them off), otherwise replace it so a subscription from an old key isn't kept.
      const key = urlBase64ToUint8Array(vapidPublicKey)
      let subscription = await registration.pushManager.getSubscription()
      if (subscription && !sameApplicationServerKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe().catch(() => undefined)
        subscription = null
      }
      subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })

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

  async function disableAlerts() {
    setBusy(true)
    setMessage('')
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        await fetch('/api/admin/notifications/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        // The browser keeps its subscription: the store's offer notifications may use it too.
        // With the server's row gone, no order alert is sent to it.
      }
      setState('disabled')
      setMessage('Order alerts turned off on this device.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to turn off order alerts')
    } finally { setBusy(false) }
  }

  async function test() {
    setBusy(true)
    setMessage('')
    try {
      const subscription = await currentSubscription()
      if (!subscription) {
        setState('disabled')
        throw new Error('Order alerts aren\u2019t set up on this device yet. Tap Enable order alerts.')
      }
      // Sent to this device only, so the result is about this device.
      const response = await fetch('/api/admin/notifications/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: true, endpoint: subscription.endpoint }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send test notification')
      if (!data.sent) {
        setState('disabled')
        throw new Error(data.skipped
          ? 'Push is not configured on the server.'
          : 'This device isn\u2019t registered for order alerts any more. Tap Enable order alerts again.')
      }
      setMessage('Test sent to this device. If nothing appears within a few seconds, notifications for this browser are switched off in the device\u2019s settings.')
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
      {state === 'enabled' && (
        <>
          <button type="button" className="orderAlertsIconBtn" onClick={test} disabled={busy} title="Send a test order alert to this device" aria-label="Send test alert">
            <Send size={14} /><span>Test alert</span>
          </button>
          <button type="button" className="orderAlertsIconBtn" onClick={disableAlerts} disabled={busy} title="Turn off order alerts on this device" aria-label="Turn off order alerts on this device">
            <BellOff size={14} /><span>Turn off</span>
          </button>
        </>
      )}
      {message && <span className={`orderAlertsMsg ${ui.muted}`} role="status">{message}</span>}
      <style jsx>{`
        .orderAlertsWrap{position:relative;display:flex;align-items:center;gap:6px;justify-content:flex-end}
        .orderAlertsBtn{display:flex;align-items:center;gap:6px;pointer-events:auto;touch-action:manipulation;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:999px;padding:0 11px;height:38px;font-size:12px;font-weight:700;color:var(--admin-ink-soft);cursor:pointer;white-space:nowrap}
        .orderAlertsBtn[data-enabled='true']{background:var(--admin-accent-soft);border-color:var(--admin-accent);color:var(--admin-accent-strong)}
        .orderAlertsBtn:disabled{cursor:default}
        .orderAlertsIconBtn{display:flex;align-items:center;gap:6px;pointer-events:auto;touch-action:manipulation;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:999px;padding:0 11px;height:38px;font-size:12px;font-weight:700;color:var(--admin-ink-soft);cursor:pointer;white-space:nowrap}
        .orderAlertsIconBtn:disabled{cursor:default;opacity:.6}
        /* Absolutely positioned rather than an inline flex sibling: the topbar
           that hosts this component has a fixed height with default (visible)
           overflow, so a wrapped inline message doesn't grow the header -- it
           spills straight through it and overlaps the page content underneath.
           Floating it below the button keeps the header's box intact no
           matter how long the message is. */
        .orderAlertsMsg{position:absolute;top:100%;right:0;margin-top:8px;z-index:1;display:block;width:max-content;max-width:240px;padding:8px 10px;border:1px solid var(--admin-border);border-radius:10px;background:var(--admin-surface);box-shadow:var(--admin-shadow-md, 0 8px 24px rgba(0,0,0,.12));font-size:11px;line-height:1.4;text-align:left}
        @media(max-width:1100px){
          .orderAlertsBtn,.orderAlertsIconBtn{width:38px;height:38px;padding:0;justify-content:center;border-radius:10px}
          .orderAlertsBtn span,.orderAlertsIconBtn span{display:none}
        }
        @media(max-width:560px){
          .orderAlertsBtn,.orderAlertsIconBtn{width:36px;height:36px}
        }
      `}</style>
    </div>
  )
}

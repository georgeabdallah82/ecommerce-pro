'use client'

import { useEffect, useState } from 'react'

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
      if (Notification.permission !== 'granted') { if (!cancelled) setState('disabled'); return }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled) setState(subscription ? 'enabled' : 'disabled')
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
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
      const response = await fetch('/api/admin/notifications/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to enable order alerts')
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
      const response = await fetch('/api/admin/notifications/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: true }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send test notification')
      if (!data.sent) throw new Error(data.skipped ? 'Push is not configured on the server' : 'No active push subscription was found for this device')
      setMessage('Test notification sent.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Test failed')
    } finally { setBusy(false) }
  }

  if (state === 'hidden') return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1000, pointerEvents: 'auto' }}>
      <button
        type="button"
        onClick={enable}
        disabled={busy || state === 'enabled'}
        title={state === 'enabled' ? 'Order alerts are enabled on this device' : 'Enable new-order notifications on this device'}
        style={{ position: 'relative', zIndex: 1001, pointerEvents: 'auto', touchAction: 'manipulation', marginLeft: 10, border: '1px solid #eaded4', background: state === 'enabled' ? '#f2fdf7' : '#fff', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: state === 'enabled' ? 'default' : 'pointer' }}
      >
        {busy ? 'Working…' : state === 'enabled' ? '🔔 Order alerts on' : '🔔 Enable order alerts'}
      </button>
      {state === 'enabled' && <button type="button" onClick={test} disabled={busy} style={{ position: 'relative', zIndex: 1001, pointerEvents: 'auto', touchAction: 'manipulation', border: '1px solid #eaded4', background: '#fff', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>Test alert</button>}
      {message && <span className="muted" style={{ fontSize: 11, maxWidth: 220 }}>{message}</span>}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

export default function CustomerPushToggle({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [state, setState] = useState<'hidden' | 'disabled' | 'enabled'>('hidden')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function inspect() {
      if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
      try {
        const statusResponse = await fetch('/api/account/push', { cache: 'no-store' })
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
      setMessage('Push notifications are not configured on this store.')
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

      // Tied to the VAPID key used when created -- drop any subscription left over
      // from a previous key so it can't silently go stale.
      const existing = await registration.pushManager.getSubscription()
      if (existing) await existing.unsubscribe().catch(() => undefined)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const response = await fetch('/api/account/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.subscribed !== true) throw new Error(data.error || 'Unable to verify subscription on the server')
      setState('enabled')
      setMessage('Push notifications enabled on this device.')
    } catch (e) {
      setState('disabled')
      setMessage(e instanceof Error ? e.message : 'Unable to enable notifications')
    } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/account/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe().catch(() => undefined)
      }
      setState('disabled')
      setMessage('Push notifications turned off on this device.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to turn off push notifications')
    } finally { setBusy(false) }
  }

  if (state === 'hidden') return null
  return (
    <div className="card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong>Push notifications</strong>
        <p className="muted" style={{ marginTop: 4 }}>Get an alert on this device for order updates and occasional offers.</p>
        {message && <small className="muted" role="status" style={{ display: 'block', marginTop: 6 }}>{message}</small>}
      </div>
      {state === 'enabled' ? (
        <button type="button" className="btn secondary" onClick={disable} disabled={busy}>{busy ? 'Working…' : 'Turn off'}</button>
      ) : (
        <button type="button" className="btn" onClick={enable} disabled={busy}>{busy ? 'Working…' : 'Enable'}</button>
      )}
    </div>
  )
}

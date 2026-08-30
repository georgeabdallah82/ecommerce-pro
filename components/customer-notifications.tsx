'use client'

import { useEffect, useState } from 'react'

function keyBytes(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

export default function CustomerNotifications({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
      const response = await fetch('/api/account/notifications/push', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!cancelled && response.ok) setSubscribed(data.subscribed === true)
    }
    void load()
    return () => { cancelled = true }
  }, [vapidPublicKey])

  async function toggle() {
    setBusy(true); setMessage('')
    try {
      if (!vapidPublicKey) throw new Error('Notifications are not configured yet.')
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support push notifications.')
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      if (subscribed) {
        const current = await registration.pushManager.getSubscription()
        if (current) {
          await fetch('/api/account/notifications/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: current.endpoint }) })
          await current.unsubscribe().catch(() => undefined)
        }
        setSubscribed(false)
        setMessage('Marketing notifications disabled.')
        return
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const existing = await registration.pushManager.getSubscription()
      if (existing) await existing.unsubscribe().catch(() => undefined)
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) })
      const response = await fetch('/api/account/notifications/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.subscribed !== true) throw new Error(data.error || 'Unable to enable notifications.')
      setSubscribed(true)
      setMessage('You will receive deals and store updates here.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to update notifications.')
    } finally { setBusy(false) }
  }

  if (!vapidPublicKey) return null
  return <section className="card" style={{ padding: 20, marginTop: 20 }}>
    <div className="sectionHead small">
      <div><span className="muted">NOTIFICATIONS</span><h3>Deals & store updates</h3><p className="muted">Get new deals, launches and special messages on this device. You can turn marketing notifications off anytime.</p></div>
      <button className="btn secondary" type="button" disabled={busy} onClick={toggle}>{busy ? 'Working…' : subscribed ? '🔕 Disable' : '🔔 Enable'}</button>
    </div>
    {message && <p className="muted" style={{ margin: '10px 0 0' }}>{message}</p>}
  </section>
}

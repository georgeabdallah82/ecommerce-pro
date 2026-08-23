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

  useEffect(() => {
    if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    setState(Notification.permission === 'granted' ? 'enabled' : 'disabled')
  }, [vapidPublicKey])

  async function enable() {
    if (!vapidPublicKey) return
    setBusy(true)
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') { setState('disabled'); return }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
      const response = await fetch('/api/admin/notifications/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
      if (!response.ok) throw new Error('Unable to enable order alerts')
      setState('enabled')
    } catch {
      setState('disabled')
    } finally { setBusy(false) }
  }

  if (state === 'hidden') return null
  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy || state === 'enabled'}
      title={state === 'enabled' ? 'Order alerts are enabled on this device' : 'Enable new-order notifications on this device'}
      style={{ marginLeft: 10, border: '1px solid #eaded4', background: state === 'enabled' ? '#f2fdf7' : '#fff', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: state === 'enabled' ? 'default' : 'pointer' }}
    >
      {busy ? 'Enabling…' : state === 'enabled' ? '🔔 Order alerts on' : '🔔 Enable order alerts'}
    </button>
  )
}

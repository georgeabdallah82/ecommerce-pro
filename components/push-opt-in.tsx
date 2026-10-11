'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { PUSH_PROMPT_DELAY_MS, PUSH_PROMPT_DISMISSED_KEY, PUSH_PROMPT_SUBSCRIBED_KEY, shouldOfferPush } from '@/lib/push-opt-in'
import { pushSupported, subscribeThisBrowser } from '@/lib/push-client'
import styles from './push-opt-in.module.css'

function readStored(key: string): number | null {
  try { const value = Number(window.localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : null } catch { return null }
}
function store(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value) } catch { /* private mode: the box just asks again next visit */ }
}

// The storefront's "Want offers and order updates?" box (rules in lib/push-opt-in.ts). Shown a
// few seconds after a visitor arrives, never on checkout or in the admin; "Not now" hides it for
// 30 days. Yes asks the browser, then saves the device for Push campaigns (/api/push/subscribe).
// Browsers without web push (iPhone Safari outside a home-screen app) never see it.
export default function PushOptIn({ vapidPublicKey, enabled, storeName }: { vapidPublicKey?: string; enabled: boolean; storeName: string }) {
  const pathname = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'blocked'>('ask')

  useEffect(() => {
    const supported = pushSupported()
    const offer = shouldOfferPush({
      enabled,
      hasKey: !!vapidPublicKey,
      supported,
      permission: supported ? Notification.permission : 'denied',
      subscribed: !!readStored(PUSH_PROMPT_SUBSCRIBED_KEY),
      pathname,
      dismissedAt: readStored(PUSH_PROMPT_DISMISSED_KEY),
      now: Date.now(),
    })
    if (!offer) { setOpen(false); return }
    const timer = window.setTimeout(() => setOpen(true), PUSH_PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, vapidPublicKey, pathname])

  function notNow() {
    store(PUSH_PROMPT_DISMISSED_KEY, String(Date.now()))
    setOpen(false)
  }

  async function yes() {
    if (!vapidPublicKey) return
    setState('busy')
    try {
      const subscription = await subscribeThisBrowser(vapidPublicKey)
      if (!subscription) {
        // Said no (or closed the browser's prompt): don't ask again for a while.
        store(PUSH_PROMPT_DISMISSED_KEY, String(Date.now()))
        setState('blocked')
        window.setTimeout(() => setOpen(false), 4000)
        return
      }
      const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
      if (!response.ok) throw new Error('save failed')
      store(PUSH_PROMPT_SUBSCRIBED_KEY, String(Date.now()))
      store(PUSH_PROMPT_DISMISSED_KEY, null)
      setState('done')
      window.setTimeout(() => setOpen(false), 3500)
    } catch {
      // Something in the browser or the network failed: close quietly and try again next visit.
      setState('ask')
      setOpen(false)
    }
  }

  if (!open) return null
  return (
    <div className={styles.box} role="dialog" aria-labelledby="push-opt-in-title" aria-describedby="push-opt-in-text">
      <button type="button" className={styles.close} onClick={notNow} aria-label="Not now"><X size={16} /></button>
      <span className={styles.icon} aria-hidden="true"><Bell size={20} /></span>
      {state === 'done' ? (
        <div className={styles.body}>
          <strong id="push-opt-in-title">You&apos;re in!</strong>
          <p id="push-opt-in-text">We&apos;ll let you know about offers and your orders.</p>
        </div>
      ) : state === 'blocked' ? (
        <div className={styles.body}>
          <strong id="push-opt-in-title">No problem</strong>
          <p id="push-opt-in-text">You can turn notifications on any time from your account.</p>
        </div>
      ) : (
        <div className={styles.body}>
          <strong id="push-opt-in-title">Get deals before anyone else</strong>
          <p id="push-opt-in-text">Turn on notifications for offers and order updates from {storeName}. You can turn them off any time.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={notNow} disabled={state === 'busy'}>Not now</button>
            <button type="button" className={styles.primary} onClick={yes} disabled={state === 'busy'}>{state === 'busy' ? 'One moment…' : 'Yes, notify me'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

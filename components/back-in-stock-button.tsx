'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'
import { Bell, Check, Mail } from 'lucide-react'
import { pushSupported, subscribeThisBrowser } from '@/lib/push-client'
import styles from './back-in-stock-button.module.css'

const doneKey = (productId: string, variantId: string | null) => `back-in-stock:${productId}:${variantId || '-'}`

// "Notify me when it's back" in place of Add to Cart on a sold-out product (or option). Asks for a
// notification on this browser when it can show one; otherwise (iPhone Safari outside the
// home-screen app, or notifications blocked) asks for an email address. lib/back-in-stock.ts
// sends the message when stock comes back.
export default function BackInStockButton({ productId, variantId, optionName, vapidPublicKey, customerEmail }: {
  productId: string
  variantId: string | null
  optionName?: string
  vapidPublicKey?: string
  customerEmail?: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'ask' | 'email' | 'done'>('ask')
  const [busy, setBusy] = useState(false)
  const [doneBy, setDoneBy] = useState<'push' | 'email'>('push')
  const [email, setEmail] = useState(customerEmail || '')
  const [error, setError] = useState('')
  const { t } = useI18n()

  // Already asked for this option on this browser: say so instead of asking again.
  useEffect(() => {
    setError('')
    try {
      const saved = window.localStorage.getItem(doneKey(productId, variantId))
      if (saved === 'push' || saved === 'email') { setDoneBy(saved); setState('done'); return }
    } catch {}
    setState('ask')
  }, [productId, variantId])

  async function save(body: Record<string, unknown>, by: 'push' | 'email') {
    const response = await fetch('/api/back-in-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, variantId, ...body }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(t(data.error || 'Something went wrong. Please try again.'))
    // It came back while the page was open: show the up-to-date page with Add to Cart.
    if (data.inStock) { router.refresh(); return }
    try { window.localStorage.setItem(doneKey(productId, variantId), by) } catch {}
    setDoneBy(by)
    setState('done')
  }

  async function notifyMe() {
    setError('')
    const canPush = !!vapidPublicKey && pushSupported() && Notification.permission !== 'denied'
    if (!canPush) { setState('email'); return }
    setBusy(true)
    try {
      const subscription = await subscribeThisBrowser(vapidPublicKey!)
      // Said no to notifications: an email works just as well.
      if (!subscription) { setState('email'); return }
      await save({ subscription: subscription.toJSON() }, 'push')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('Something went wrong. Please try again.'))
      setState('email')
    } finally {
      setBusy(false)
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await save({ email }, 'email')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (state === 'done') {
    return (
      <div className={`${styles.box} ${styles.done}`} role="status">
        <span className={styles.icon} aria-hidden="true"><Check size={18} /></span>
        <div>
          <strong>{t("We'll let you know")}</strong>
          <p>{doneBy === 'push'
            ? (optionName ? t("You'll get a notification on this phone when {name} is back in stock.", { name: optionName }) : t("You'll get a notification on this phone when it's back in stock."))
            : (optionName ? t("We'll email you when {name} is back in stock.", { name: optionName }) : t("We'll email you when it's back in stock."))}</p>
        </div>
      </div>
    )
  }

  if (state === 'email') {
    return (
      <form className={styles.box} onSubmit={submitEmail}>
        <span className={styles.icon} aria-hidden="true"><Mail size={18} /></span>
        <div className={styles.body}>
          <strong>{optionName ? t('Get an email when {name} is back', { name: optionName }) : t("Get an email when it's back")}</strong>
          <div className={styles.emailRow}>
            {/* It appears in place of the button that was pressed, so focus moves here instead of to the top of the page. */}
            <input autoFocus type="email" required autoComplete="email" inputMode="email" placeholder={t('Your email')} value={email} onChange={e => setEmail(e.target.value)} aria-label={t('Your email')} />
            <button type="submit" className={styles.primary} disabled={busy}>{busy ? t('Saving…') : t('Notify me')}</button>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </form>
    )
  }

  return (
    <div className={styles.ask}>
      <button type="button" className={styles.primary} onClick={notifyMe} disabled={busy}>
        <Bell size={17} /> {busy ? t('One moment…') : t("Notify me when it's back")}
      </button>
      <p className={styles.note}>{optionName ? t("Sold out for now. We'll tell you as soon as {name} is back in stock.", { name: optionName }) : t("Sold out for now. We'll tell you as soon as it's back in stock.")}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}

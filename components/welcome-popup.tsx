'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check, Copy, Gift, X } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { useSelling } from '@/components/selling-client'
import { INVITE_STORAGE_KEY } from '@/components/invite-landing'
import { useModalFocus } from '@/components/use-modal-focus'

const KEY = 'yh-welcome-v1'
const SKIP = ['/checkout', '/cart', '/admin', '/account', '/order', '/review', '/orders', '/invoice', '/pay-invoice', '/track', '/theme-editor-preview', '/maintenance', '/driver']

// Welcome discount (Settings > Selling tools): a first-time visitor is offered the first-order
// code for their WhatsApp number. Shown once per browser; never on checkout or account pages.
// While it is due, the notification popup (components/push-opt-in.tsx) waits its turn.
export default function WelcomePopup() {
  const { t } = useI18n()
  const pathname = usePathname() || '/'
  const selling = useSelling()
  const welcome = selling?.welcome
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!welcome?.enabled || SKIP.some(p => pathname.startsWith(p))) return
    // A friend's invite link already gave a first-order code (components/invite-landing.tsx).
    const invited = () => { try { return !!localStorage.getItem(INVITE_STORAGE_KEY) } catch { return false } }
    try { if (localStorage.getItem(KEY) || invited() || new URLSearchParams(window.location.search).has('invite')) return } catch { return }
    document.documentElement.dataset.welcomePopup = 'pending'
    const timer = window.setTimeout(() => {
      if (invited()) { delete document.documentElement.dataset.welcomePopup; return }
      setOpen(true)
      try { localStorage.setItem(KEY, 'shown') } catch {}
    }, (welcome.delaySeconds || 0) * 1000)
    return () => window.clearTimeout(timer)
  }, [welcome?.enabled, welcome?.delaySeconds, pathname])

  function close() {
    setOpen(false)
    delete document.documentElement.dataset.welcomePopup
  }
  // Focus moves to the number field and stays in the box; Escape closes it (components/use-modal-focus.ts). Once the
  // code is there, focus moves to it, so it is read out.
  const dialogRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, open && !!welcome, close)
  useEffect(() => { if (code) codeRef.current?.focus() }, [code])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (phone.replace(/\D/g, '').length < 7) { setError(t('This number looks incomplete. Check it, e.g. 70 123 456.')); return }
    setBusy(true)
    try {
      const r = await fetch('/api/welcome', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(t(String(d.error || 'Something went wrong. Please try again.')))
      setCode(String(d.code || ''))
      // Checkout applies a saved code by itself.
      try { localStorage.setItem('ecom-coupon-code', String(d.code || '')); localStorage.setItem(KEY, 'joined') } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !welcome) return null
  return <div ref={dialogRef} className="welcomePop" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-text" tabIndex={-1} onClick={e => { if (e.target === e.currentTarget) close() }}>
    <div className="welcomeCard">
      <button type="button" className="welcomeClose" onClick={close} aria-label={t('Close')}><X size={20} /></button>
      <Gift size={34} aria-hidden="true" style={{ margin: '0 auto', color: 'var(--store-primary, #d7261e)' }} />
      <h2 id="welcome-title">{welcome.title || t('A gift for your first order')}</h2>
      {code ? <>
        <p id="welcome-text">{t('Here is your code. It is already saved for checkout.')}</p>
        <div ref={codeRef} tabIndex={-1} className="welcomeCode" dir="ltr">{code}<button type="button" onClick={() => { navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {}) }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('Copied') : t('Copy')}</button></div>
        <button type="button" className="welcomeStart" onClick={close}>{t('Start shopping')}</button>
      </> : <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <p id="welcome-text">{t('Enter your WhatsApp number and get your discount code now.')}</p>
        <input data-autofocus type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('e.g. 70 123 456')} aria-label={t('WhatsApp number')} />
        {error && <p className="welcomeError" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? t('Sending…') : t('Get my code')}</button>
        <p className="welcomeFine">{t('By sending your number you agree to get our offers on WhatsApp. You can stop anytime.')}</p>
      </form>}
    </div>
  </div>
}

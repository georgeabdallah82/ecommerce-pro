'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'
import styles from './guest-cancel-box.module.css'

// "Changed your mind? Cancel my order" for a customer without an account: on the thank-you page and
// on the order page, for a short time and only until the store confirms the order
// (lib/guest-cancel.ts). `token` is the order's view code, made on the server for a visitor who
// already passed the order's access check.
export default function GuestCancelBox({ orderNumber, token, deadline }: { orderNumber: string; token: string; deadline: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const end = new Date(deadline).getTime()
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((end - Date.now()) / 1000)))
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [end])

  async function cancel() {
    setStep('busy'); setError('')
    try {
      const r = await fetch('/api/orders/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderNumber, t: token }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to cancel the order right now. Please contact us on WhatsApp.')
      setStep('done')
      router.refresh()
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'Unable to cancel the order right now. Please contact us on WhatsApp.'))
      setStep('idle')
    }
  }

  if (step === 'done') return <section className={styles.box} role="status"><strong>{t('Your order was cancelled. Nothing to pay.')}</strong></section>
  if (left <= 0) return null
  const minutes = Math.max(1, Math.ceil(left / 60))

  return <section className={styles.box} aria-label={t('Changed your mind?')}>
    <div className={styles.text}>
      <strong>{t('Changed your mind?')}</strong>
      <span>{t('You can cancel this order in the next {minutes} min, until we confirm it.', { minutes })}</span>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {step === 'confirm' || step === 'busy'
      ? <div className={styles.confirm}>
          <span>{t('Cancel this order?')}</span>
          <div className={styles.buttons}>
            <button type="button" className={styles.danger} onClick={cancel} disabled={step === 'busy'}>{step === 'busy' ? t('Cancelling…') : t('Yes, cancel it')}</button>
            <button type="button" className={styles.plain} onClick={() => setStep('idle')} disabled={step === 'busy'}>{t('Keep my order')}</button>
          </div>
        </div>
      : <button type="button" className={styles.plain} onClick={() => { setError(''); setStep('confirm') }}>{t('Cancel my order')}</button>}
    {step === 'idle' && error && <Link className={styles.link} href="/shop">{t('Continue shopping')}</Link>}
  </section>
}

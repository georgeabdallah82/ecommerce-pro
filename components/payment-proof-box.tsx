'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'
import { MAX_PROOFS_PER_ORDER, MAX_PROOF_BYTES } from '@/lib/payment-proof'
import styles from './payment-proof-box.module.css'

// "I paid by transfer: send a screenshot" on the thank-you page and the order page, for orders paid by
// bank or wallet transfer that are not marked paid yet (lib/payment-proof.ts). `token` is the order's
// view code, made on the server for a visitor who already passed the order's access check.
export default function PaymentProofBox({ orderNumber, token, count }: { orderNumber: string; token: string; count: number }) {
  const { t } = useI18n()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [sent, setSent] = useState(count)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justSent, setJustSent] = useState(false)
  const full = sent >= MAX_PROOFS_PER_ORDER

  async function upload(file: File | undefined) {
    if (!file) return
    setError(''); setJustSent(false)
    if (file.size > MAX_PROOF_BYTES) { setError(t('That picture is larger than 5 MB. Please choose a smaller one.')); return }
    setBusy(true)
    try {
      const body = new FormData()
      body.set('orderNumber', orderNumber); body.set('t', token); body.set('file', file)
      const r = await fetch('/api/orders/payment-proof', { method: 'POST', body })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'We could not save your screenshot right now. Please send it to us on WhatsApp.')
      setSent(Number(d.count) || sent + 1); setJustSent(true)
      router.refresh()
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'We could not save your screenshot right now. Please send it to us on WhatsApp.'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return <section className={styles.box} aria-label={t('Send your payment screenshot')}>
    <div className={styles.text}>
      <strong>{sent > 0 ? t('Thank you, we received your screenshot') : t('Paid by transfer? Send us the screenshot')}</strong>
      <span>{sent > 0 ? t('We will check it and confirm your payment soon.') : t('Take a screenshot of the transfer and add it here. It helps us confirm your payment faster.')}</span>
    </div>
    {justSent && <p className={styles.ok} role="status"><CheckCircle2 size={18} aria-hidden="true" /> {t('Screenshot sent.')}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!full && <>
      <input ref={input} className={styles.file} id={`proof-${orderNumber}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files?.[0])} disabled={busy} />
      <label className={`${styles.button} ${busy ? styles.busy : ''}`} htmlFor={`proof-${orderNumber}`}><Upload size={18} aria-hidden="true" /> {busy ? t('Sending…') : sent > 0 ? t('Send another screenshot') : t('Choose the screenshot')}</label>
    </>}
  </section>
}

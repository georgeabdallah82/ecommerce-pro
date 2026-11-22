'use client'

import { useState, type FormEvent } from 'react'
import { MessageCircle } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

// "Sign in with WhatsApp" on the sign-in page (lib/phone-sign-in.ts): the customer's mobile number, then the 6-digit
// code WhatsApp brings. Shown only when the store has set up the code's WhatsApp template.
export default function PhoneSignIn({ next }: { next: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function post(path: string, body: unknown) {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(t(data.error || 'Something went wrong. Please try again.'))
    return data
  }
  async function send(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await post('/api/auth/phone/start', { phone })
      setSentTo(String(data.phone || phone)); setCode(''); setStep('code')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await post('/api/auth/phone/verify', { phone, code, next })
      // A full load, so every part of the page sees the new session.
      window.location.assign(String(data.next || '/account'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong. Please try again.'))
      setBusy(false)
    }
  }

  const [sentBefore, sentAfter = ''] = t('We sent a code to {phone} on WhatsApp.').split('{phone}')
  if (!open) return <button type="button" className="authSecondary authWhatsApp" onClick={() => setOpen(true)}><MessageCircle size={18} aria-hidden="true" /> {t('Sign in with WhatsApp')}</button>
  if (step === 'phone') return (
    <form className="authForm authPhone" onSubmit={send}>
      <label className="fieldLabel" htmlFor="wa-phone">{t('Mobile number')}</label>
      <input className="input" id="wa-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="70 123 456" required autoFocus />
      <p className="authHint">{t('We send a 6-digit code to this number on WhatsApp. No password needed.')}</p>
      {error && <div className="alert danger" role="alert">{error}</div>}
      <button className="btn authSubmit" disabled={busy || !phone.trim()}>{busy ? t('Sending…') : t('Send the code')}</button>
    </form>
  )
  return (
    <form className="authForm authPhone" onSubmit={verify}>
      {/* The number keeps its left-to-right order inside an Arabic sentence (+961 70..., not 70...961+). */}
      <p className="authHint" role="status">{sentBefore}<bdi dir="ltr">{sentTo}</bdi>{sentAfter}</p>
      <label className="fieldLabel" htmlFor="wa-code">{t('Code')}</label>
      <input className="input authCode" id="wa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus />
      {error && <div className="alert danger" role="alert">{error}</div>}
      <button className="btn authSubmit" disabled={busy || code.length !== 6}>{busy ? t('Signing in…') : t('Sign in')}</button>
      <button type="button" className="authTextButton" onClick={() => { setStep('phone'); setError('') }}>{t('Use another number, or send a new code')}</button>
    </form>
  )
}

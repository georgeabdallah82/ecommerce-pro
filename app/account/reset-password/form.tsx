'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) return setMessage(t('Passwords do not match.'))
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const data = await response.json()
      setMessage(data.message || data.error || t('Unable to reset password.'))
    } catch {
      setMessage(t('Unable to reset password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const done = /updated|reset|success/i.test(message) && !/unable|invalid|expired|match/i.test(message)
  // The sign-in page's card, on its own (app/storefront-account.css: .authShell.isSolo).
  return (
    <main className="section authPage">
      <div className="container">
        <div className="authShell isSolo">
          <div className="authMain">
            <span className="authBadge" aria-hidden="true"><LockKeyhole size={22} /></span>
            <h1 className="authTitle">{t('Reset your password')}</h1>
            <p className="authLead">{t('Choose a new password for your account.')}</p>
            {!token && <div className="alert danger" role="alert">{t('This reset link is missing or incomplete.')} <Link href="/account/forgot-password" style={{ textDecoration: 'underline' }}>{t('Request a new one')}</Link>.</div>}
            <form onSubmit={submit} className="authForm">
              <label className="fieldLabel" htmlFor="password">{t('New password')}</label>
              <input className="input" id="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required aria-describedby="password-hint" value={password} onChange={e => setPassword(e.target.value)} />
              <p className="authHint" id="password-hint">{t('At least 8 characters.')}</p>
              <label className="fieldLabel" htmlFor="confirm">{t('Confirm password')}</label>
              <input className="input" id="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} />
              <button className="btn authSubmit" disabled={!token || loading} type="submit">{loading ? t('Resetting…') : t('Reset password')}</button>
              {message && <p className="authNotice" role="status">{message}</p>}
            </form>
            {done
              ? <Link className="authSecondary authAfter" href="/account/login">{t('Sign in with your new password')}</Link>
              : <Link className="authBack" href="/account/login"><ArrowLeft size={16} aria-hidden="true" />{t('Back to sign in')}</Link>}
          </div>
        </div>
      </div>
    </main>
  )
}

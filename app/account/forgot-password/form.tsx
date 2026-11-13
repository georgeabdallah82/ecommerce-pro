'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()
      setMessage(data.message || data.error || t('If an account exists, recovery instructions have been sent.'))
    } catch {
      setMessage(t('Unable to process the request. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  // The sign-in page's card, on its own (app/storefront-account.css: .authShell.isSolo).
  return (
    <main className="section authPage">
      <div className="container">
        <div className="authShell isSolo">
          <div className="authMain">
            <span className="authBadge" aria-hidden="true"><KeyRound size={22} /></span>
            <h1 className="authTitle">{t('Forgot password?')}</h1>
            <p className="authLead">{t("Enter your email and, if an account exists, we'll send recovery instructions.")}</p>
            <form onSubmit={submit} className="authForm">
              <label className="fieldLabel" htmlFor="email">{t('Email')}</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
              <button className="btn authSubmit" disabled={loading}>{loading ? t('Sending…') : t('Send reset instructions')}</button>
              {message && <p className="authNotice" role="status">{message}</p>}
            </form>
            <Link className="authBack" href="/account/login"><ArrowLeft size={16} aria-hidden="true" />{t('Back to sign in')}</Link>
          </div>
        </div>
      </div>
    </main>
  )
}

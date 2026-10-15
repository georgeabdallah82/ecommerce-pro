'use client'

import { useContext, useState } from 'react'
import { trackLead } from '@/lib/tracking-events'
import { StorefrontPreviewContext } from '@/components/preview-context'
import { useI18n } from '@/components/lang-provider'

// One signup form shared by the Newsletter section and the footer, so both talk to
// the same endpoint (/api/newsletter) and behave the same way: native email
// validation, a loading state, a success message that replaces nothing on the page,
// and an inline error. In the theme editor's preview (`preview`) it never submits.
export default function NewsletterForm({
  className, buttonClassName, buttonLabel, placeholder,
  successMessage, source = 'storefront', preview: previewProp = false,
}: {
  className?: string; buttonClassName?: string; buttonLabel?: string; placeholder?: string
  successMessage?: string; source?: string; preview?: boolean
}) {
  const preview = previewProp || !!useContext(StorefrontPreviewContext)
  const { t } = useI18n()
  const label = buttonLabel || t('Subscribe')
  const hint = placeholder || t('Email address')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot: real visitors never see it
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (preview || status === 'loading') return
    setStatus('loading')
    setError('')
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, company, source }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(t(data.error || 'Something went wrong. Please try again.'))
      setEmail('')
      setStatus('done')
      trackLead()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong. Please try again.'))
      setStatus('error')
    }
  }

  return (
    <div>
      <form className={className} onSubmit={submit}>
        <input type="email" required value={email} onChange={event => { setEmail(event.target.value); if (status !== 'loading') setStatus('idle') }} placeholder={hint} aria-label={hint} autoComplete="email" />
        <input type="text" name="company" value={company} onChange={event => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, border: 0, overflow: 'hidden', clipPath: 'inset(50%)', opacity: 0 }} />
        <button className={buttonClassName} type="submit" disabled={status === 'loading'}>{status === 'loading' ? t('Subscribing…') : label}</button>
      </form>
      <p role="status" aria-live="polite" style={{ margin: status === 'idle' ? 0 : '10px 0 0', fontSize: 13, fontWeight: 600, color: status === 'error' ? '#b42318' : 'inherit' }}>
        {status === 'done' ? (successMessage || t('Thanks for subscribing!')) : status === 'error' ? error : ''}
      </p>
    </div>
  )
}

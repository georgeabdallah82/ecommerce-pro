'use client'

import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'

// The wholesale / bulk-order form. Posts to /api/wholesale; the server checks every field again.
export default function WholesaleForm() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/wholesale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || t('Unable to send your request. Please try again or message us on WhatsApp.'))
      setDone(true)
      event.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Unable to send your request. Please try again or message us on WhatsApp.'))
    } finally {
      setBusy(false)
    }
  }

  if (done) return <div className="card"><strong>{t('Thank you. We will contact you soon.')}</strong><p className="muted">{t('For an urgent order, message us on WhatsApp.')}</p></div>

  return <form className="card wholesaleForm" onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 18 }}>
    <style>{`.wholesaleForm label{display:grid;gap:6px;font-weight:700;font-size:14px}.wholesaleForm input,.wholesaleForm textarea{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid #d6d6d0;border-radius:10px;background:#fff;color:inherit;font:inherit;font-size:16px;font-weight:400}.wholesaleForm textarea{min-height:110px;resize:vertical}.wholesaleForm input:focus-visible,.wholesaleForm textarea:focus-visible{outline:3px solid #2563eb;outline-offset:1px}.wholesaleForm .btn{min-height:48px;width:100%}`}</style>
    <label>{t('Business name')}<input name="businessName" required maxLength={120} /></label>
    <label>{t('Your name')}<input name="contactName" required maxLength={80} /></label>
    <label>{t('Email')}<input name="email" type="email" required maxLength={120} /></label>
    <label>{t('Phone or WhatsApp')}<input name="phone" type="tel" required maxLength={25} /></label>
    <label>{t('City')}<input name="city" maxLength={80} /></label>
    <label>{t('What would you like to buy?')}<input name="interest" maxLength={500} placeholder={t('For example: soap, towels, 50 boxes a month')} /></label>
    <label>{t('Anything else we should know?')}<textarea name="message" rows={4} maxLength={1000} /></label>
    {error ? <p role="alert" style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>{error}</p> : null}
    <button className="btn" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send request')}</button>
  </form>
}

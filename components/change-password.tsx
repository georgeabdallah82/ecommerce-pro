'use client'
import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'

export default function ChangePassword() {
  const { t } = useI18n()
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'done' | 'error'; message?: string }>({ status: 'idle' })
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (data.get('newPassword') !== data.get('confirmPassword')) { setState({ status: 'error', message: t("The new passwords don't match.") }); return }
    setState({ status: 'saving' })
    const res = await fetch('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setState({ status: 'error', message: body.error || t('Unable to change password.') }); return }
    form.reset()
    setState({ status: 'done', message: t("Password changed. You've been signed out on your other devices.") })
  }
  return (
    <form className="card" style={{ padding: 24, marginTop: 24 }} onSubmit={submit}>
      <h2 className="h3 accountTitle" style={{ marginTop: 0 }}>{t('Change password')}</h2>
      <label className="fieldLabel" htmlFor="currentPassword">{t('Current password')}</label>
      <input className="input" id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      <label className="fieldLabel" htmlFor="newPassword" style={{ marginTop: 12 }}>{t('New password')}</label>
      <input className="input" id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      <label className="fieldLabel" htmlFor="confirmPassword" style={{ marginTop: 12 }}>{t('Confirm new password')}</label>
      <input className="input" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      {state.message && <div className={state.status === 'error' ? 'alert danger' : 'alert'} role="status" style={{ marginTop: 14 }}>{state.message}</div>}
      <button className="btn" style={{ marginTop: 16 }} disabled={state.status === 'saving'}>{state.status === 'saving' ? t('Saving…') : t('Update password')}</button>
    </form>
  )
}

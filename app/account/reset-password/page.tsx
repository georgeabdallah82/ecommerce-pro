'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function ResetPasswordPage() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) return setMessage('Passwords do not match.')
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const data = await response.json()
      setMessage(data.message || data.error || 'Unable to reset password.')
    } catch {
      setMessage('Unable to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-12">
      <form onSubmit={submit} className="w-full space-y-5 rounded-2xl border p-6 shadow-sm">
        <div><h1 className="text-2xl font-semibold">Reset your password</h1><p className="mt-1 text-sm text-muted-foreground">Choose a new password for your account.</p></div>
        <label className="block text-sm">New password<input className="mt-2 w-full rounded-lg border p-3" type="password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="block text-sm">Confirm password<input className="mt-2 w-full rounded-lg border p-3" type="password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <button disabled={!token || loading} className="w-full rounded-lg border px-4 py-3 font-medium disabled:opacity-50" type="submit">{loading ? 'Resetting…' : 'Reset password'}</button>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </main>
  )
}

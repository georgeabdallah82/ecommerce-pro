'use client'

import { useState } from 'react'

const roles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'EDITOR', 'CUSTOMER'] as const

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt?: string | null
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export function UsersAdmin({ initial }: { initial: UserRow[] }) {
  const [rows, setRows] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MANAGER' })
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setRows(await api('/api/admin/users'))
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm({ name: '', email: '', password: '', role: 'MANAGER' })
      setShowAdd(false)
      setMessage('User created successfully.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create user')
    } finally {
      setBusy(false)
    }
  }

  async function updateUser(id: string, data: Record<string, unknown>) {
    setError('')
    setMessage('')
    try {
      await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id, ...data }) })
      setMessage('User updated successfully.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update user')
    }
  }

  async function removeUser(user: UserRow) {
    if (!user.isActive) return
    if (!confirm(`Disable ${user.name}? They will no longer be able to sign in.`)) return
    await updateUser(user.id, { isActive: false })
  }

  return (
    <div>
      <div className="sectionHead">
        <div>
          <span className="muted">ACCESS CONTROL</span>
          <h1 className="h2">Users & roles</h1>
          <p className="muted">Manage staff access. User administration is restricted to Super Admins.</p>
        </div>
        <button className="btn" onClick={() => { setShowAdd(v => !v); setError(''); setMessage('') }}>
          {showAdd ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert">{message}</div>}

      {showAdd && (
        <form onSubmit={createUser} className="card adminPanel grid fourFields" style={{ marginBottom: 16 }}>
          <input className="input" required placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input" required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className="input" required minLength={8} type="password" placeholder="Temporary password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            {roles.map(role => <option key={role}>{role}</option>)}
          </select>
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        </form>
      )}

      <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Active</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map(user => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><div className="muted">{user.email}</div></td>
                <td>
                  <select className="input compact" value={user.role} onChange={e => updateUser(user.id, { role: e.target.value })}>
                    {roles.map(role => <option key={role}>{role}</option>)}
                  </select>
                </td>
                <td>{user.isActive ? <span className="pill">Active</span> : <span className="pill">Disabled</span>}</td>
                <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td>
                  <div className="inline" style={{ gap: 8 }}>
                    <button className="textButton" onClick={() => { const password = prompt('New password (minimum 8 characters)'); if (password) updateUser(user.id, { password }) }}>Reset password</button>
                    {user.isActive && <button className="textButton" onClick={() => removeUser(user)}>Remove</button>}
                    {!user.isActive && <button className="textButton" onClick={() => updateUser(user.id, { isActive: true })}>Restore</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export type RegisterRow = { id: string; name: string; status: 'ACTIVE' | 'INACTIVE'; locationName: string; openShifts: number }
export type LocationOption = { id: string; name: string }

const field = { minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #cfcfc8', font: 'inherit', minWidth: 0 } as const
const button = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #d6d6cf', background: '#fff', cursor: 'pointer', font: 'inherit' } as const
const primary = { ...button, background: '#171717', color: '#fff', border: '1px solid #171717' } as const

export default function PosRegistersManager({ registers, locations }: { registers: RegisterRow[]; locations: LocationOption[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(url: string, body: unknown, method: 'POST' | 'PATCH', success: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setMessage(String(data.error ?? 'Something went wrong. Please try again.'))
      setMessage(success)
      router.refresh()
    } catch {
      setMessage('No connection. Nothing was saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function add(event: FormEvent) {
    event.preventDefault()
    void send('/api/admin/pos/registers', { name, locationId }, 'POST', 'Register added.')
    setName('')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8, border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', padding: 16 }}>
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Register name (e.g. Till 1)" aria-label="Register name" style={field} />
        <select value={locationId} onChange={event => setLocationId(event.target.value)} aria-label="Location" style={field}>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <button type="submit" disabled={busy || !name.trim() || !locationId} style={primary}>Add register</button>
      </form>
      {message && <p role="status" style={{ margin: 0, color: '#5f6673' }}>{message}</p>}

      <div style={{ border: '1px solid #e4e4df', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
        {registers.length === 0 ? (
          <p style={{ margin: 0, padding: 16, color: '#5f6673' }}>No registers yet. Add one above before cashiers open shifts.</p>
        ) : registers.map(register => (
          <div key={register.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid #f0f0ec', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ fontWeight: 600 }}>{register.name}</strong>
              <span style={{ display: 'block', color: '#5f6673', fontSize: 13 }}>
                {register.locationName} · {register.status === 'ACTIVE' ? 'On' : 'Off'} · {register.openShifts} open {register.openShifts === 1 ? 'shift' : 'shifts'}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(`/api/admin/pos/registers/${register.id}`, { status: register.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }, 'PATCH', register.status === 'ACTIVE' ? 'Register switched off.' : 'Register switched on.')}
              style={button}
            >
              {register.status === 'ACTIVE' ? 'Switch off' : 'Switch on'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'

type Address = {
  id: string
  label: string | null
  firstName: string
  lastName: string
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  country: string
  phone: string | null
  isDefault: boolean
}

type FormState = {
  label: string
  firstName: string
  lastName: string
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
  phone: string
  isDefault: boolean
}

const emptyForm: FormState = { label: '', firstName: '', lastName: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: '', phone: '', isDefault: false }

function toForm(a: Address): FormState {
  return { label: a.label || '', firstName: a.firstName, lastName: a.lastName, line1: a.line1, line2: a.line2 || '', city: a.city, region: a.region || '', postalCode: a.postalCode || '', country: a.country, phone: a.phone || '', isDefault: a.isDefault }
}

export default function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function startAdd() {
    setForm(emptyForm)
    setAdding(true)
    setEditingId(null)
    setError('')
  }

  function startEdit(a: Address) {
    setForm(toForm(a))
    setEditingId(a.id)
    setAdding(false)
    setError('')
  }

  function cancelForm() {
    setAdding(false)
    setEditingId(null)
    setError('')
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.line1.trim() || !form.city.trim() || !form.country.trim()) {
      setError('First name, last name, address, city, and country are required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const url = editingId ? `/api/account/addresses/${encodeURIComponent(editingId)}` : '/api/account/addresses'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to save address')
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save address')
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this address?')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/account/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to delete address')
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete address')
      setBusy(false)
    }
  }

  async function setDefault(a: Address) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/account/addresses/${encodeURIComponent(a.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...toForm(a), isDefault: true }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to update address')
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update address')
      setBusy(false)
    }
  }

  const formOpen = adding || editingId !== null

  return (
    <section>
      <div className="sectionHead small">
        <h3>Addresses</h3>
        {!formOpen && <button className="btn secondary" type="button" onClick={startAdd}>Add address</button>}
      </div>

      {error && <p className="muted" style={{ color: '#c0392b', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {formOpen && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <label className="fieldLabel">Label <span className="muted">(optional)</span><input className="input" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Home, Work, etc." /></label>
          <div className="grid two">
            <label className="fieldLabel">First name<input className="input" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="First name" /></label>
            <label className="fieldLabel">Last name<input className="input" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" /></label>
          </div>
          <label className="fieldLabel">Address<input className="input" required value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })} placeholder="Street address" /></label>
          <label className="fieldLabel">Apartment, floor, etc. <span className="muted">(optional)</span><input className="input" value={form.line2} onChange={e => setForm({ ...form, line2: e.target.value })} placeholder="Apartment, floor, etc." /></label>
          <div className="grid two">
            <label className="fieldLabel">City<input className="input" required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" /></label>
            <label className="fieldLabel">Region<input className="input" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="Region" /></label>
          </div>
          <div className="grid two">
            <label className="fieldLabel">Postal code<input className="input" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} placeholder="Postal code" /></label>
            <label className="fieldLabel">Country<input className="input" required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Country" /></label>
          </div>
          <label className="fieldLabel">Phone <span className="muted">(optional)</span><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" /></label>
          <label className="fieldLabel" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} /> Set as default address</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save address'}</button>
            <button className="btn secondary" type="button" disabled={busy} onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {addresses.length ? (
        <div className="grid" style={{ gap: 10 }}>
          {addresses.map(a => (
            <div className="card" style={{ padding: 18 }} key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.label || 'Address'}</strong>
                {a.isDefault && <span className="pill">Default</span>}
              </div>
              <p className="muted">{a.firstName} {a.lastName}<br />{a.line1}{a.line2 && <><br />{a.line2}</>}<br />{a.city}{a.region ? `, ${a.region}` : ''}<br />{a.country}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => startEdit(a)}>Edit</button>
                {!a.isDefault && <button className="btn secondary" type="button" disabled={busy} onClick={() => setDefault(a)}>Set as default</button>}
                <button className="btn secondary" type="button" disabled={busy} onClick={() => remove(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : !formOpen ? (
        <div className="card empty"><p className="muted">No saved addresses.</p></div>
      ) : null}
    </section>
  )
}

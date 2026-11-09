'use client'
import { useState } from 'react'
import { useI18n } from '@/components/lang-provider'

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
  const { t } = useI18n()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The address to delete, while the customer is asked to confirm (no browser dialog).
  const [askDeleteId, setAskDeleteId] = useState<string | null>(null)

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
      setError(t('First name, last name, address, city, and country are required'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const url = editingId ? `/api/account/addresses/${encodeURIComponent(editingId)}` : '/api/account/addresses'
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('Unable to save address'))
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to save address'))
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setAskDeleteId(null)
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/account/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('Unable to delete address'))
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to delete address'))
      setBusy(false)
    }
  }

  async function setDefault(a: Address) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/account/addresses/${encodeURIComponent(a.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...toForm(a), isDefault: true }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('Unable to update address'))
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Unable to update address'))
      setBusy(false)
    }
  }

  const formOpen = adding || editingId !== null

  return (
    <section>
      <div className="sectionHead small">
        <h3>{t('Addresses')}</h3>
        {!formOpen && <button className="btn secondary" type="button" onClick={startAdd}>{t('Add address')}</button>}
      </div>

      {error && <p className="muted" style={{ color: '#c0392b', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {formOpen && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <label className="fieldLabel">{t('Label')} <span className="muted">{t('(optional)')}</span><input className="input" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={t('Home, Work, etc.')} /></label>
          <div className="grid two">
            <label className="fieldLabel">{t('First name')}<input className="input" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder={t('First name')} /></label>
            <label className="fieldLabel">{t('Last name')}<input className="input" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder={t('Last name')} /></label>
          </div>
          <label className="fieldLabel">{t('Address')}<input className="input" required value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })} placeholder={t('Street address')} /></label>
          <label className="fieldLabel">{t('Apartment, floor, etc.')} <span className="muted">{t('(optional)')}</span><input className="input" value={form.line2} onChange={e => setForm({ ...form, line2: e.target.value })} placeholder={t('Apartment, floor, etc.')} /></label>
          <div className="grid two">
            <label className="fieldLabel">{t('City')}<input className="input" required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder={t('City')} /></label>
            <label className="fieldLabel">{t('Region')}<input className="input" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder={t('Region')} /></label>
          </div>
          <div className="grid two">
            <label className="fieldLabel">{t('Postal code')}<input className="input" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} placeholder={t('Postal code')} /></label>
            <label className="fieldLabel">{t('Country')}<input className="input" required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder={t('Country')} /></label>
          </div>
          <label className="fieldLabel">{t('Phone')} <span className="muted">{t('(optional)')}</span><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={t('Phone')} /></label>
          <label className="fieldLabel" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} /> {t('Set as default address')}</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? t('Saving…') : editingId ? t('Save changes') : t('Save address')}</button>
            <button className="btn secondary" type="button" disabled={busy} onClick={cancelForm}>{t('Cancel')}</button>
          </div>
        </div>
      )}

      {addresses.length ? (
        <div className="grid" style={{ gap: 10 }}>
          {addresses.map(a => (
            <div className="card" style={{ padding: 18 }} key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.label || t('Address')}</strong>
                {a.isDefault && <span className="pill">{t('Default')}</span>}
              </div>
              <p className="muted">{a.firstName} {a.lastName}<br />{a.line1}{a.line2 && <><br />{a.line2}</>}<br />{a.city}{a.region ? `, ${a.region}` : ''}<br />{a.country}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => startEdit(a)}>{t('Edit')}</button>
                {!a.isDefault && <button className="btn secondary" type="button" disabled={busy} onClick={() => setDefault(a)}>{t('Set as default')}</button>}
                {askDeleteId === a.id
                  ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                    <span>{t('Delete this address?')}</span>
                    <button className="btn secondary" type="button" disabled={busy} onClick={() => remove(a.id)}>{t('Yes, delete')}</button>
                    <button className="btn secondary" type="button" disabled={busy} onClick={() => setAskDeleteId(null)}>{t('Keep it')}</button>
                  </span>
                  : <button className="btn secondary" type="button" disabled={busy} onClick={() => setAskDeleteId(a.id)}>{t('Delete')}</button>}
              </div>
            </div>
          ))}
        </div>
      ) : !formOpen ? (
        <div className="card empty"><p className="muted">{t('No saved addresses.')}</p></div>
      ) : null}
    </section>
  )
}

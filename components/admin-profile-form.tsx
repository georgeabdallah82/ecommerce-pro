'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import s from './admin-profile.module.css'

type Message = { tone: 'ok' | 'error'; text: string }

// My profile: the signed-in staff member's name and photo. Saves through app/api/admin/profile.
export default function AdminProfileForm({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  const [saved, setSaved] = useState(name)
  const [draft, setDraft] = useState(name)
  const [photo, setPhoto] = useState(avatarUrl)
  const [busy, setBusy] = useState<'name' | 'photo' | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const initials = (saved || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('name'); setMessage(null)
    const res = await fetch('/api/admin/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: draft }) })
    const body = await res.json().catch(() => ({})) as { name?: string; error?: string }
    setBusy(null)
    if (res.ok && body.name) { setSaved(body.name); setDraft(body.name); setMessage({ tone: 'ok', text: 'Your name is saved.' }) }
    else setMessage({ tone: 'error', text: body.error || 'Could not save your name.' })
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy('photo'); setMessage(null)
    const form = new FormData()
    form.append('avatar', file)
    const res = await fetch('/api/admin/profile', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string }
    setBusy(null)
    event.target.value = ''
    if (res.ok && body.avatarUrl) { setPhoto(body.avatarUrl); setMessage({ tone: 'ok', text: 'Your photo is saved. It shows at the top right after the next page load.' }) }
    else setMessage({ tone: 'error', text: body.error || 'Could not upload your photo.' })
  }

  return <div className={s.wrap}>
    <section className={s.card} aria-labelledby="photo-h">
      <h2 id="photo-h" className={s.h2}>Photo</h2>
      <div className={s.photoRow}>
        <span className={s.avatar} aria-hidden="true">{photo ? <img src={photo} alt="" /> : initials}</span>
        <div className={s.photoText}>
          <label className={s.fileBtn}>
            {busy === 'photo' ? 'Uploading…' : photo ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={busy !== null} aria-label="Upload a profile photo" />
          </label>
          <p className={s.hint}>JPG, PNG or WebP, up to 2 MB. A square photo of your face works best.</p>
        </div>
      </div>
    </section>

    <section className={s.card} aria-labelledby="name-h">
      <h2 id="name-h" className={s.h2}>Name</h2>
      <form className={s.form} onSubmit={saveName}>
        <label className={s.field}>
          <span>Your name</span>
          <input className={s.input} value={draft} onChange={e => setDraft(e.target.value)} maxLength={80} autoComplete="name" required />
        </label>
        <label className={s.field}>
          <span>Email</span>
          <input className={s.input} value={email} readOnly aria-readonly="true" />
          <small className={s.hint}>Your email is set by the store owner.</small>
        </label>
        <div className={s.actions}>
          <button type="submit" className={s.primary} disabled={busy !== null || draft.trim() === saved}>{busy === 'name' ? 'Saving…' : 'Save name'}</button>
        </div>
      </form>
    </section>

    {message && <p className={message.tone === 'ok' ? s.ok : s.error} role="status">{message.text}</p>}
  </div>
}

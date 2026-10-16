'use client'

import { useMemo, useState } from 'react'
import { CalendarHeart, Check, Plus, Trash2 } from 'lucide-react'
import { OCCASION_PRESETS, addDays, dayKeyOf, defaultsFor, nextFixedDate, type Occasion } from '@/lib/occasions'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

const longDay = (key: string) => key ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`)) : ''

// Marketing > Occasions (app/admin/marketing/occasions): "Order by Friday 20 March to receive it
// for Mother's Day" on the store, shown and hidden by date.
export default function OccasionsAdmin({ initial, collections, canEdit }: { initial: Occasion[]; collections: Array<{ name: string; slug: string }>; canEdit: boolean }) {
  const today = useMemo(() => dayKeyOf(new Date()), [])
  const [list, setList] = useState<Occasion[]>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const set = (i: number, patch: Partial<Occasion>) => setList(rows => rows.map((o, j) => j === i ? { ...o, ...patch } : o))

  function add(preset?: (typeof OCCASION_PRESETS)[number]) {
    const date = preset?.month && preset.day ? nextFixedDate(preset.month, preset.day, today) : ''
    const d = date ? defaultsFor(date) : { orderBy: '', showFrom: '' }
    setList(rows => [...rows, { id: `o${Date.now().toString(36)}`, name: preset?.name || '', nameAr: preset?.nameAr || '', date, orderBy: d.orderBy, showFrom: d.showFrom, link: '' }])
    setMsg(''); setError('')
  }

  async function save() {
    setBusy(true); setMsg(''); setError('')
    try {
      const r = await fetch('/api/admin/marketing/occasions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occasions: list }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save')
      setList(d.occasions || [])
      setMsg('Saved. Each message shows on the store between its dates, then hides by itself.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  const unused = OCCASION_PRESETS.filter(p => !list.some(o => o.name.toLowerCase() === p.name.toLowerCase()))

  return <div className={s.page}>
    <div>
      <h1 className={s.title}>Occasions</h1>
      <p className={s.subtitle}>Mother&apos;s Day, Christmas, Eid... From the day you choose, the store shows &quot;Order by Friday 20 March to receive it for Mother&apos;s Day&quot; on the home page, product pages and the cart. After the last day to order, it hides by itself.</p>
    </div>
    {(error || msg) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || msg}</div>}
    {canEdit && unused.length > 0 && <section className={`${ui.card} ${s.card}`}>
      <strong className={s.name}>Add an occasion</strong>
      <div className={s.chips}>
        {unused.map(p => <button key={p.name} type="button" className={s.chip} onClick={() => add(p)}><Plus size={14} /> {p.name}</button>)}
        <button type="button" className={s.chip} onClick={() => add()}><Plus size={14} /> Another one</button>
      </div>
      <p className={ui.muted}>Easter, the Eids and back to school change every year: choose their day yourself.</p>
    </section>}
    {!list.length && <div className={`${ui.card} ${ui.empty}`}><CalendarHeart size={28} /><h3>No occasions yet</h3><p className={ui.muted}>Add one above.</p></div>}
    {list.map((o, i) => {
      const live = o.showFrom && o.orderBy && o.showFrom <= today && today <= o.orderBy
      const past = o.orderBy && o.orderBy < today
      return <section key={o.id} className={`${ui.card} ${s.card}`}>
        <div className={s.head}>
          <div><strong className={s.name}>{o.name || 'New occasion'}</strong><div className={s.meta}>{live ? <span style={{ color: '#15803d', fontWeight: 700 }}>Showing on the store now</span> : past ? <span>Finished</span> : o.showFrom ? <span>Shows from {longDay(o.showFrom)}</span> : <span>Choose the dates</span>}</div></div>
          {canEdit && <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => setList(rows => rows.filter((_, j) => j !== i))} aria-label={`Remove ${o.name || 'occasion'}`}><Trash2 size={15} /></button>}
        </div>
        <div className={ui.twoCol}>
          <label className={ui.fieldLabel}>Name<input className={ui.input} value={o.name} onChange={e => set(i, { name: e.target.value })} placeholder="Mother's Day" disabled={!canEdit} /></label>
          <label className={ui.fieldLabel}>Name in Arabic (optional)<input className={ui.input} dir="rtl" value={o.nameAr} onChange={e => set(i, { nameAr: e.target.value })} disabled={!canEdit} /></label>
          <label className={ui.fieldLabel}>Day of the occasion<input className={ui.input} type="date" value={o.date} onChange={e => { const date = e.target.value; set(i, date && !o.orderBy ? { date, ...defaultsFor(date) } : { date }) }} disabled={!canEdit} /></label>
          <label className={ui.fieldLabel}>Last day to order<input className={ui.input} type="date" value={o.orderBy} max={o.date || undefined} onChange={e => set(i, { orderBy: e.target.value })} disabled={!canEdit} /></label>
          <label className={ui.fieldLabel}>Start showing on<input className={ui.input} type="date" value={o.showFrom} max={o.orderBy || undefined} onChange={e => set(i, { showFrom: e.target.value })} disabled={!canEdit} /></label>
          <label className={ui.fieldLabel}>Button &quot;Shop gifts&quot; opens
            <select className={ui.select} value={o.link} onChange={e => set(i, { link: e.target.value })} disabled={!canEdit}>
              <option value="">No button</option>
              <option value="/shop">All products</option>
              {collections.map(c => <option key={c.slug} value={`/collections/${c.slug}`}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {o.orderBy && o.date && <p className={ui.muted}>Customers will read: &quot;Order by {longDay(o.orderBy).replace(/ \d{4}$/, '')} to receive it for {o.name || '...'}.&quot;{o.orderBy === addDays(o.date, 0) ? ' (Same day as the occasion: make sure you can deliver that fast.)' : ''}</p>}
      </section>
    })}
    {canEdit && <div className={s.actions}><button type="button" className={ui.btn} onClick={save} disabled={busy}><Check size={16} /> {busy ? 'Saving...' : 'Save'}</button></div>}
  </div>
}

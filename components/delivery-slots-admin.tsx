'use client'

import { useState } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { MAX_SLOTS, MAX_SLOT_LABEL, SUGGESTED_SLOTS, type DeliverySlot, type DeliverySlotsConfig } from '@/lib/delivery-slots'
import s from './delivery-slots-admin.module.css'
import ui from './admin-ui.module.css'

const newId = () => `n${Math.random().toString(36).slice(2, 8)}`

// Admin > Shipping > "Delivery times customers can choose" (lib/delivery-slots.ts).
export default function DeliverySlotsAdmin({ initial, canManage }: { initial: DeliverySlotsConfig; canManage: boolean }) {
  const [saved, setSaved] = useState(initial)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [slots, setSlots] = useState<DeliverySlot[]>(initial.slots)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dirty = enabled !== saved.enabled || JSON.stringify(slots.map(x => x.label.trim())) !== JSON.stringify(saved.slots.map(x => x.label))
  const edit = (id: string, label: string) => setSlots(list => list.map(x => x.id === id ? { ...x, label: label.slice(0, MAX_SLOT_LABEL) } : x))

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await fetch('/api/admin/delivery-slots', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, slots }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save')
      setSaved(d.config); setEnabled(d.config.enabled); setSlots(d.config.slots)
      setNotice(d.config.enabled ? 'Saved. Customers can now choose a delivery time at checkout (it can take up to a minute to appear).' : 'Saved. Customers are not asked for a delivery time.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save') } finally { setBusy(false) }
  }

  return <section className={`${ui.card} ${s.card}`}>
    <div className={s.head}>
      <div>
        <strong className={s.title}><Clock size={16} /> Delivery times customers can choose</strong>
        <p className={ui.muted}>{enabled ? 'On: at checkout customers can pick one of these times (or "Any time"). It shows on the order, the daily delivery sheet and the driver\'s page.' : 'Off: customers are not asked. Switch on and write the times you can deliver, for example Morning or Evening.'}</p>
      </div>
      <button type="button" role="switch" aria-checked={enabled} aria-label="Let customers choose a delivery time" disabled={!canManage || busy} className={`${s.switch} ${enabled ? s.on : ''}`} onClick={() => setEnabled(v => !v)}><i /></button>
    </div>
    <div className={s.list}>
      {slots.map((slot, i) => <div className={s.row} key={slot.id}>
        <input className={ui.input} value={slot.label} maxLength={MAX_SLOT_LABEL} disabled={!canManage} aria-label={`Delivery time ${i + 1}`} placeholder="e.g. Evening (4pm to 8pm)" onChange={e => edit(slot.id, e.target.value)} />
        {canManage && <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} aria-label={`Remove delivery time ${i + 1}`} onClick={() => setSlots(list => list.filter(x => x.id !== slot.id))}><Trash2 size={15} /></button>}
      </div>)}
    </div>
    {canManage && <div className={s.actions}>
      {slots.length < MAX_SLOTS && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setSlots(list => [...list, { id: newId(), label: '' }])}><Plus size={14} /> Add a time</button>}
      {!slots.length && <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setSlots(SUGGESTED_SLOTS.map(label => ({ id: newId(), label })))}>Use Morning, Afternoon and Evening</button>}
      <button type="button" className={ui.btn} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>}
    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}
  </section>
}

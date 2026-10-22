'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/admin-link'
import { Check, ChevronDown, Copy, MessageCircle, Pause, Pencil, Play, Plus, Star, Trash2, Wallet } from 'lucide-react'
import { NumInput } from '@/components/num-input'
import { MAX_COMMISSION_PERCENT, MAX_CUSTOMER_PERCENT, MAX_CODE_LENGTH, suggestInfluencerCode, cleanInfluencerCode } from '@/lib/influencers-shared'
import { useConfirm } from './admin-confirm'
import s from './bring-back.module.css'
import x from './influencers-admin.module.css'
import ui from './admin-ui.module.css'

export type InfluencerView = {
  id: string; name: string; handle: string; phone: string; code: string; customerPercent: number; commissionPercent: number; isActive: boolean; notes: string
  orders: number; delivered: number; sales: string; waitingSales: string; earned: string; waiting: string; waitingCents: number; paid: string; owed: string; owedCents: number; overpaid: string
  whatsappHref: string
  recentOrders: Array<{ id: string; orderNumber: string; status: string; date: string; value: string; commission: string }>
  payouts: Array<{ id: string; amount: string; note: string; date: string }>
}

type Form = { name: string; handle: string; phone: string; code: string; customerPercent: number | null; commissionPercent: number | null; notes: string }
const emptyForm: Form = { name: '', handle: '', phone: '', code: '', customerPercent: 10, commissionPercent: 10, notes: '' }
const statusText = (status: string) => status.charAt(0) + status.slice(1).toLowerCase()

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.')
  return d
}

function InfluencerForm({ form, setForm, editing }: { form: Form; setForm: (next: Form) => void; editing: boolean }) {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  return <div className={x.fields}>
    <label className={x.field}><span className={x.label}>Name</span>
      <input className={ui.input} value={form.name} maxLength={80} onChange={e => set({ name: e.target.value })} placeholder="e.g. Maya Haddad" /></label>
    <label className={x.field}><span className={x.label}>Instagram / TikTok <i>(optional)</i></span>
      <input className={ui.input} value={form.handle} maxLength={60} onChange={e => set({ handle: e.target.value })} placeholder="@maya" /></label>
    <label className={x.field}><span className={x.label}>WhatsApp number <i>(optional)</i></span>
      <input className={ui.input} value={form.phone} maxLength={30} inputMode="tel" dir="ltr" onChange={e => set({ phone: e.target.value })} placeholder="70 123 456" />
      <span className={x.help}>To send them their code on WhatsApp.</span></label>
    <label className={x.field}><span className={x.label}>Their code</span>
      <input className={ui.input} value={form.code} maxLength={MAX_CODE_LENGTH} dir="ltr" disabled={editing} onChange={e => set({ code: cleanInfluencerCode(e.target.value) })}
        onFocus={() => { if (!editing && !form.code) { const suggestion = suggestInfluencerCode(form.name, form.customerPercent ?? 0); if (suggestion) set({ code: suggestion }) } }} placeholder="e.g. MAYA10" />
      <span className={x.help}>{editing ? 'The code cannot change after it is made.' : 'Letters and numbers only. Customers type it at checkout.'}</span></label>
    <label className={x.field}><span className={x.label}>Customer discount</span>
      <span className={x.pct}><NumInput className={ui.input} value={form.customerPercent} onValue={v => set({ customerPercent: v })} /><span>%</span></span>
      <span className={x.help}>What their followers save (1 to {MAX_CUSTOMER_PERCENT}).</span></label>
    <label className={x.field}><span className={x.label}>Their commission</span>
      <span className={x.pct}><NumInput className={ui.input} value={form.commissionPercent} onValue={v => set({ commissionPercent: v })} /><span>%</span></span>
      <span className={x.help}>What they earn on delivered orders (0 to {MAX_COMMISSION_PERCENT}).</span></label>
    <label className={`${x.field} ${x.wide}`}><span className={x.label}>Notes <i>(optional, only you see this)</i></span>
      <textarea className={ui.textarea} value={form.notes} maxLength={500} onChange={e => set({ notes: e.target.value })} /></label>
  </div>
}

// Admin > Marketing > Influencers (app/admin/marketing/influencers).
export default function InfluencersAdmin({ initial, totalOwed, currency, canManage }: { initial: InfluencerView[]; totalOwed: string; currency: string; canManage: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState<Form>(emptyForm)
  const [payingId, setPayingId] = useState('')
  const [payAmount, setPayAmount] = useState<number | null>(null)
  const [payNote, setPayNote] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key); setError(''); setNotice('')
    try { await work(); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setBusy('') }
  }

  const add = () => run('add', async () => {
    await call('/api/admin/influencers', 'POST', form)
    setNotice(`Code ${form.code} is ready. Send it to ${form.name} on WhatsApp.`)
    setAdding(false); setForm(emptyForm)
  })
  const startEdit = (row: InfluencerView) => {
    setEditingId(row.id); setPayingId('')
    setEditForm({ name: row.name, handle: row.handle, phone: row.phone, code: row.code, customerPercent: row.customerPercent, commissionPercent: row.commissionPercent, notes: row.notes })
  }
  const saveEdit = (row: InfluencerView) => run(`edit-${row.id}`, async () => {
    await call('/api/admin/influencers', 'PATCH', { id: row.id, ...editForm, isActive: row.isActive })
    setEditingId(''); setNotice('Saved.')
  })
  const togglePause = (row: InfluencerView) => run(`pause-${row.id}`, async () => {
    await call('/api/admin/influencers', 'PATCH', { id: row.id, name: row.name, handle: row.handle, phone: row.phone, customerPercent: row.customerPercent, commissionPercent: row.commissionPercent, notes: row.notes, isActive: !row.isActive })
    setNotice(row.isActive ? `${row.code} is paused: customers can no longer use it.` : `${row.code} works again.`)
  })
  const remove = async (row: InfluencerView) => {
    if (!await confirm({ title: `Remove ${row.name}?`, message: `The code ${row.code} stops existing. Nobody has ordered with it yet.`, confirmLabel: 'Remove', tone: 'danger' })) return
    await run(`del-${row.id}`, async () => { await call(`/api/admin/influencers?id=${encodeURIComponent(row.id)}`, 'DELETE'); setNotice('Removed.') })
  }
  const startPay = (row: InfluencerView) => { setPayingId(row.id); setEditingId(''); setPayAmount(row.owedCents / 100 || null); setPayNote('') }
  const savePay = (row: InfluencerView) => run(`pay-${row.id}`, async () => {
    await call('/api/admin/influencers/payouts', 'POST', { influencerId: row.id, amount: Math.round((payAmount ?? 0) * 100), note: payNote })
    setPayingId(''); setNotice(`Payment to ${row.name} saved.`)
  })
  const undoPay = async (row: InfluencerView, id: string, amount: string) => {
    if (!await confirm({ title: 'Remove this payment?', message: `${amount} paid to ${row.name} will count as still owed again. Only do this if it was written by mistake.`, confirmLabel: 'Remove payment', tone: 'danger' })) return
    await run(`undo-${id}`, async () => { await call(`/api/admin/influencers/payouts?id=${encodeURIComponent(id)}`, 'DELETE'); setNotice('Payment removed.') })
  }
  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1800) } catch { setError('Could not copy. Select the code and copy it by hand.') }
  }
  const toggleOpen = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const active = initial.filter(i => i.isActive).length
  const orders = initial.reduce((sum, i) => sum + i.orders, 0)

  return <div className={s.page}>
    <div className={x.top}>
      <div>
        <h1 className={s.title}>Influencers</h1>
        <p className={s.subtitle}>Give each influencer their own code. Their followers get a discount, every order with the code is counted for them, and they earn a commission once the order is delivered.</p>
      </div>
      {canManage && !adding && <button type="button" className={ui.btn} onClick={() => { setAdding(true); setError('') }}><Plus size={16} /> Add an influencer</button>}
    </div>
    {error && <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</div>}
    {notice && <div className={ui.alert} role="status">{notice}</div>}

    {adding && <section className={`${ui.card} ${x.form}`}>
      <h2 className={x.formTitle}>New influencer</h2>
      <InfluencerForm form={form} setForm={setForm} editing={false} />
      <div className={s.actions}>
        <button type="button" className={ui.btn} disabled={busy === 'add'} onClick={add}><Check size={16} /> {busy === 'add' ? 'Saving…' : 'Make the code'}</button>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setAdding(false); setForm(emptyForm) }}>Cancel</button>
      </div>
    </section>}

    <div className={s.stats}>
      <div><strong>{active}</strong><span>active influencers</span></div>
      <div><strong>{orders}</strong><span>orders with their codes</span></div>
      <div><strong>{totalOwed}</strong><span>you owe in total</span></div>
    </div>

    {!initial.length ? <div className={`${ui.card} ${ui.empty}`}><Star size={28} /><h3>No influencers yet</h3><p className={ui.muted}>Add the first one. You choose their code, what their followers save, and what they earn.</p></div>
      : <div className={s.list}>{initial.map(row => <article key={row.id} className={`${ui.card} ${s.card}${row.isActive ? '' : ` ${x.paused}`}`}>
        <div className={s.head}>
          <div>
            <strong className={s.name}>{row.name}{row.handle ? <span className={ui.muted}> · {row.handle}</span> : null}{!row.isActive && <> <span className={ui.statusPill}>Paused</span></>}</strong>
            <div className={x.codeLine}>
              <span>Code <span className={s.code}>{row.code}</span></span>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => copyCode(row.code)}>{copied === row.code ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
              <span>{row.customerPercent}% off for customers · {row.commissionPercent}% for them</span>
            </div>
          </div>
        </div>

        <div className={x.numbers}>
          <div><strong>{row.orders}</strong><span>orders ({row.delivered} delivered)</span></div>
          <div><strong>{row.sales}</strong><span>delivered sales</span></div>
          <div><strong>{row.earned}</strong><span>they earned</span></div>
          <div><strong>{row.paid}</strong><span>you paid</span></div>
          <div className={x.owe}><strong>{row.owed}</strong><span>you owe</span></div>
        </div>
        {row.waitingCents > 0 && <p className={s.wait}>{row.waiting} more once the orders on their way are delivered.</p>}
        {row.overpaid && <p className={x.warn}>You paid {row.overpaid} more than they earned so far.</p>}

        {editingId === row.id && canManage && <div className={x.pay}>
          <InfluencerForm form={editForm} setForm={setEditForm} editing />
          <div className={s.actions}>
            <button type="button" className={ui.btn} disabled={busy === `edit-${row.id}`} onClick={() => saveEdit(row)}><Check size={16} /> {busy === `edit-${row.id}` ? 'Saving…' : 'Save'}</button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setEditingId('')}>Cancel</button>
          </div>
        </div>}

        {payingId === row.id && canManage && <div className={x.pay}>
          <p className={x.sub}>Write down a payment to {row.name}</p>
          <div className={x.fields}>
            <label className={x.field}><span className={x.label}>Amount paid ({currency})</span><NumInput className={ui.input} decimals value={payAmount} onValue={setPayAmount} /></label>
            <label className={x.field}><span className={x.label}>Note <i>(optional)</i></span><input className={ui.input} value={payNote} maxLength={200} onChange={e => setPayNote(e.target.value)} placeholder="e.g. cash, Whish" /></label>
          </div>
          <div className={s.actions}>
            <button type="button" className={ui.btn} disabled={busy === `pay-${row.id}` || !payAmount} onClick={() => savePay(row)}><Check size={16} /> {busy === `pay-${row.id}` ? 'Saving…' : 'Save payment'}</button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setPayingId('')}>Cancel</button>
          </div>
        </div>}

        <div className={s.actions}>
          {row.whatsappHref
            ? <a className={`${ui.btn} ${s.whatsapp}`} href={row.whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send the code on WhatsApp</a>
            : canManage && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => startEdit(row)}><MessageCircle size={16} /> Add a WhatsApp number</button>}
          {canManage && row.owedCents > 0 && payingId !== row.id && <button type="button" className={ui.btn} onClick={() => startPay(row)}><Wallet size={16} /> I paid them</button>}
          {canManage && editingId !== row.id && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => startEdit(row)}><Pencil size={16} /> Edit</button>}
          {canManage && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={busy === `pause-${row.id}`} onClick={() => togglePause(row)}>{row.isActive ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Resume</>}</button>}
          {canManage && row.orders === 0 && !row.payouts.length && <button type="button" className={`${ui.btn} ${ui.btnDanger}`} onClick={() => remove(row)}><Trash2 size={16} /> Remove</button>}
        </div>

        {(row.recentOrders.length > 0 || row.payouts.length > 0) && <>
          <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} aria-expanded={open.has(row.id)} onClick={() => toggleOpen(row.id)}><ChevronDown size={14} /> {open.has(row.id) ? 'Hide' : 'Show'} orders and payments</button>
          {open.has(row.id) && <>
            {row.recentOrders.length > 0 && <>
              <p className={x.sub}>Latest orders</p>
              <ul className={x.list}>{row.recentOrders.map(o => <li key={o.id}>
                <span><Link className={ui.textLink} href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link> <small>{statusText(o.status)} · {o.date}</small></span>
                <span>{o.value}{o.commission ? <small> · earns {o.commission}</small> : null}</span>
              </li>)}</ul>
            </>}
            {row.payouts.length > 0 && <>
              <p className={x.sub}>Payments</p>
              <ul className={x.list}>{row.payouts.map(p => <li key={p.id}>
                <span>{p.amount} <small>{p.date}{p.note ? ` · ${p.note}` : ''}</small></span>
                {canManage && <button type="button" className={ui.textButtonDanger} disabled={busy === `undo-${p.id}`} onClick={() => undoPay(row, p.id, p.amount)}>Remove</button>}
              </li>)}</ul>
            </>}
          </>}
        </>}
      </article>)}</div>}
  </div>
}

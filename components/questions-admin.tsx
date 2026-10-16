'use client'

import { useState } from 'react'
import Link from '@/components/admin-link'
import { Check, Eye, EyeOff, MessageCircle, MessageCircleQuestion, Trash2 } from 'lucide-react'
import { formatAdminDateTime } from '@/lib/admin-datetime'
import { displayPhone, whatsappChatLink } from '@/lib/checkout-followup'
import { questionAnsweredMessage } from '@/lib/product-questions'
import { useConfirm } from '@/components/admin-confirm'
import s from './bring-back.module.css'
import ui from './admin-ui.module.css'

type Question = { id: string; name: string; phone: string | null; question: string; answer: string | null; answeredAt: string | null; published: boolean; createdAt: string; product: { id: string; name: string; slug: string } }
type Tab = 'waiting' | 'answered' | 'all'

// Admin > Content > Questions (app/admin/questions).
export default function QuestionsAdmin({ initial, timezone, storeName, siteUrl, enabled, canManage }: { initial: Question[]; timezone: string; storeName: string; siteUrl: string; enabled: boolean; canManage: boolean }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState(initial)
  const [tab, setTab] = useState<Tab>(initial.some(q => !q.answer) ? 'waiting' : 'all')
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initial.map(q => [q.id, q.answer || ''])))
  // Just answered: stays in "Waiting" until the tab changes, so the WhatsApp button is right there.
  const [justAnswered, setJustAnswered] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function save(id: string, data: { answer?: string; published?: boolean }, message: string) {
    setBusy(id); setError(''); setNotice('')
    try {
      const r = await fetch('/api/admin/questions', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...data }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to save the answer')
      setRows(current => current.map(q => q.id === id ? d.question : q))
      setDrafts(current => ({ ...current, [id]: d.question.answer || '' }))
      if (d.question.answer) setJustAnswered(current => new Set(current).add(id))
      setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the answer') }
    finally { setBusy('') }
  }

  async function remove(q: Question) {
    if (!await confirm({ title: 'Delete this question?', message: `"${q.question.slice(0, 120)}" will be deleted for good.`, confirmLabel: 'Delete', tone: 'danger' })) return
    setBusy(q.id); setError(''); setNotice('')
    try {
      const r = await fetch(`/api/admin/questions?id=${encodeURIComponent(q.id)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to delete the question')
      setRows(current => current.filter(x => x.id !== q.id))
      setNotice('Question deleted.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete the question') }
    finally { setBusy('') }
  }

  const waiting = rows.filter(q => !q.answer).length
  const shown = rows.filter(q => tab === 'all' || (tab === 'waiting' ? !q.answer || justAnswered.has(q.id) : !!q.answer))

  return <div className={s.page}>
    <div>
      <h1 className={s.title}>Questions</h1>
      <p className={s.subtitle}>Questions shoppers asked on your product pages. Write the answer and publish it: it shows on the product page for everyone. If they left their WhatsApp number, send them the answer too.</p>
    </div>
    {!enabled && <div className={ui.alert}>The question form is hidden on product pages. Turn it on in <Link className={ui.textLink} href="/admin/settings">Settings &gt; Selling tools</Link>.</div>}
    {(error || notice) && <div className={error ? `${ui.alert} ${ui.alertDanger}` : ui.alert} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className={s.chips} role="tablist">
      {([['waiting', `Waiting for an answer (${waiting})`], ['answered', `Answered (${rows.length - waiting})`], ['all', `All (${rows.length})`]] as Array<[Tab, string]>).map(([value, label]) =>
        <button key={value} type="button" role="tab" aria-selected={tab === value} className={`${s.chip}${tab === value ? ` ${s.chipOn}` : ''}`} onClick={() => { setTab(value); setJustAnswered(new Set()) }}>{label}</button>)}
    </div>
    {!shown.length ? <div className={`${ui.card} ${ui.empty}`}><MessageCircleQuestion size={28} /><h3>{tab === 'waiting' ? 'All questions are answered' : 'No questions yet'}</h3><p className={ui.muted}>New questions show up here, and you get a phone notification if notifications are on.</p></div>
      : <div className={s.list}>{shown.map(q => {
        const draft = drafts[q.id] ?? ''
        const changed = draft.trim() !== (q.answer || '')
        const waHref = q.phone && q.answer ? whatsappChatLink(q.phone, questionAnsweredMessage({ storeName, name: q.name, productName: q.product.name, answer: q.answer, link: `${siteUrl}/product/${q.product.slug}#questions` })) : ''
        return <article key={q.id} className={`${ui.card} ${s.card}`}>
          <div className={s.head}>
            <div>
              <strong className={s.name}>{q.name}</strong>
              <div className={s.meta}>
                <span>about <Link className={ui.textLink} href={`/admin/products/${q.product.id}`}>{q.product.name}</Link></span>
                {q.phone && <a href={`https://wa.me/${q.phone}`} target="_blank" rel="noreferrer" dir="ltr">{displayPhone(q.phone)}</a>}
                <span>{formatAdminDateTime(q.createdAt, timezone)}</span>
              </div>
            </div>
            <span className={`${ui.statusPill} ${q.published ? ui.statusPillSuccess : q.answer ? '' : ui.statusPillWarning}`}>{q.published ? 'On the product page' : q.answer ? 'Answered, hidden' : 'Waiting'}</span>
          </div>
          <p className={s.quote} dir="auto">{q.question}</p>
          {canManage ? <div className={s.answer}>
            <label className={ui.fieldLabel}>Your answer
              <textarea className={ui.textarea} value={draft} maxLength={2000} dir="auto" onChange={e => setDrafts(current => ({ ...current, [q.id]: e.target.value }))} placeholder="Write the answer customers will see" />
            </label>
            <div className={s.actions}>
              {(changed || !q.published) && <button type="button" className={ui.btn} disabled={!!busy || !draft.trim()} onClick={() => save(q.id, { answer: draft, published: true }, 'Answer published on the product page.')}><Check size={16} /> {busy === q.id ? 'Saving…' : 'Publish answer'}</button>}
              {changed && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={!!busy} onClick={() => save(q.id, { answer: draft, published: false }, 'Answer saved, not shown on the product page.')}>Save, keep hidden</button>}
              {!changed && q.published && <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} disabled={!!busy} onClick={() => save(q.id, { published: false }, 'Hidden from the product page.')}><EyeOff size={16} /> Hide from product page</button>}
              {!changed && !q.published && q.answer && <span className={ui.muted}><Eye size={14} /> Publish to show it</span>}
              {waHref && !changed && <a className={`${ui.btn} ${s.whatsapp}`} href={waHref} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send answer on WhatsApp</a>}
              <button type="button" className={`${ui.btn} ${ui.btnDanger}`} disabled={!!busy} onClick={() => remove(q)}><Trash2 size={16} /> Delete</button>
            </div>
          </div> : q.answer && <p className={s.note} dir="auto"><strong>Answer:</strong> {q.answer}</p>}
        </article>
      })}</div>}
  </div>
}

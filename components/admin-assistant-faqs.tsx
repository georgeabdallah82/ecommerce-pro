'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useLeaveGuard } from './use-leave-guard'
import { useToast } from './admin-toast'
import { useConfirm } from './admin-confirm'
import ui from './admin-ui.module.css'
import styles from './admin-assistant.module.css'

// Admin › AI assistant › FAQ (app/api/admin/assistant/faqs): the store's own answers. The assistant
// looks here before saying it can't confirm something, and quotes these instead of guessing.

export type FaqRow = { id: string; question: string; questionAr: string | null; answer: string; answerAr: string | null; isActive: boolean }
type Draft = { id?: string; question: string; questionAr: string; answer: string; answerAr: string; isActive: boolean }
const EMPTY: Draft = { question: '', questionAr: '', answer: '', answerAr: '', isActive: true }

export default function AssistantFaqs({ initial, canManage, suggestions }: { initial: FaqRow[]; canManage: boolean; suggestions: string[] }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [faqs, setFaqs] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useLeaveGuard(!!draft && (!!draft.question.trim() || !!draft.answer.trim()))

  async function call(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, done: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/assistant/faqs', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.faqs)) { setError(data?.error || 'Please try again.'); return false }
      setFaqs(data.faqs)
      toast(done)
      return true
    } catch {
      setError('No connection. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!draft) return
    const ok = await call(draft.id ? 'PATCH' : 'POST', draft, draft.id ? 'Answer updated.' : 'Answer added. The assistant can use it within 30 seconds.')
    if (ok) setDraft(null)
  }

  async function remove(faq: FaqRow) {
    if (!(await confirm({ title: 'Remove this answer?', message: `"${faq.question}" will no longer be used by the assistant.`, confirmLabel: 'Remove' }))) return
    await call('DELETE', { id: faq.id }, 'Answer removed.')
  }

  const editor = draft ? (
    <form className={styles.faqEditor} onSubmit={e => { e.preventDefault(); void save() }}>
      <div className={styles.grid2}>
        <label className={styles.field}><span className={ui.fieldLabel}>Question</span><input className={ui.input} maxLength={300} required value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} placeholder="Do you deliver outside Beirut?" /></label>
        <label className={styles.field}><span className={ui.fieldLabel}>Question in Arabic (optional)</span><input className={ui.input} maxLength={300} dir="rtl" value={draft.questionAr} onChange={e => setDraft({ ...draft, questionAr: e.target.value })} /></label>
        <label className={styles.field}><span className={ui.fieldLabel}>Answer</span><textarea className={ui.textarea} rows={4} maxLength={1500} required value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} /></label>
        <label className={styles.field}><span className={ui.fieldLabel}>Answer in Arabic (optional)</span><textarea className={ui.textarea} rows={4} maxLength={1500} dir="rtl" value={draft.answerAr} onChange={e => setDraft({ ...draft, answerAr: e.target.value })} /></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> The assistant may use this answer</label>
      {error ? <p className={`${ui.alert} ${ui.alertDanger}`} role="alert">{error}</p> : null}
      <div className={styles.formActions}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => { setDraft(null); setError('') }} disabled={saving}>Cancel</button>
        <button type="submit" className={ui.btn} disabled={saving || !draft.question.trim() || !draft.answer.trim()}>{saving ? 'Saving…' : draft.id ? 'Save answer' : 'Add answer'}</button>
      </div>
    </form>
  ) : null

  return (
    <div className={styles.faqs}>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Your answers ({faqs.length})</h2>
            <p className={ui.muted}>Delivery, payment and returns already come from your settings. Add what only you know: opening hours, gift wrapping, sizes, warranty, pickup.</p>
          </div>
          {canManage && !draft ? <button type="button" className={ui.btn} onClick={() => setDraft(EMPTY)}><Plus size={15} /> Add an answer</button> : null}
        </div>
        {draft && !draft.id ? editor : null}
        {suggestions.length && canManage && !draft ? (
          <div className={styles.hint}>
            <strong>Shoppers asked, and the assistant had no answer:</strong>
            <ul>{suggestions.slice(0, 5).map(q => <li key={q}><button type="button" className={ui.textLink} onClick={() => setDraft({ ...EMPTY, question: q })}>{q}</button></li>)}</ul>
          </div>
        ) : null}
        {faqs.length === 0 && !draft ? <p className={ui.muted}>No answers yet.</p> : null}
        <ul className={styles.faqList}>
          {faqs.map(f => (
            <li key={f.id} className={f.isActive ? undefined : styles.off}>
              {draft?.id === f.id ? editor : (
                <>
                  <div className={styles.faqText}>
                    <strong>{f.question}</strong>
                    {!f.isActive ? <span className={`${ui.statusPill} ${ui.statusPillWarning}`}>Not used</span> : null}
                    <p>{f.answer}</p>
                    {f.answerAr ? <p dir="rtl" className={ui.muted}>{f.answerAr}</p> : null}
                  </div>
                  {canManage ? (
                    <div className={styles.rowActions}>
                      <button type="button" className={ui.iconBtn} onClick={() => setDraft({ id: f.id, question: f.question, questionAr: f.questionAr || '', answer: f.answer, answerAr: f.answerAr || '', isActive: f.isActive })} aria-label={`Edit "${f.question}"`} disabled={!!draft}><Pencil size={15} /></button>
                      <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => void remove(f)} aria-label={`Remove "${f.question}"`} disabled={saving || !!draft}><Trash2 size={15} /></button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

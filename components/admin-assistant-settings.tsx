'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import UnsavedBar from './admin-unsaved-bar'
import { NumInput } from './num-input'
import { useLeaveGuard } from './use-leave-guard'
import { useToast } from './admin-toast'
import ui from './admin-ui.module.css'
import styles from './admin-assistant.module.css'
import { ASSISTANT_MODELS, QUICK_ACTIONS, type AssistantConfig, type AssistantModel, type AssistantSuggestion, type QuickAction } from '@/lib/assistant/config'

// Admin › AI assistant › Settings (app/api/admin/assistant). Docs: docs/ai-assistant-2026-11.md.

const ACTION_LABELS: Record<QuickAction, string> = {
  find_product: 'Find a product (asks what they want)',
  best_sellers: 'Best sellers (product cards)',
  new_arrivals: 'New arrivals (product cards)',
  track_order: 'Track my order (order form)',
  delivery_info: 'Delivery information (your zones and rates)',
  support: 'Talk to support (your WhatsApp and email)',
}

export default function AssistantSettings({ initial, canManage, keyConfigured }: { initial: AssistantConfig; canManage: boolean; keyConfigured: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])
  useLeaveGuard(dirty)

  const set = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => { setForm(f => ({ ...f, [key]: value })); setError('') }
  const setSuggestion = (index: number, patch: Partial<AssistantSuggestion>) => set('suggestions', form.suggestions.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const move = (index: number, by: number) => {
    const list = [...form.suggestions]
    const [item] = list.splice(index, 1)
    list.splice(index + by, 0, item)
    set('suggestions', list)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/assistant', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.config) { setError(data?.error || 'Please try again.'); return }
      setSaved(data.config)
      setForm(data.config)
      toast('AI assistant settings saved. The shop shows them within 30 seconds.')
      router.refresh()
    } catch {
      setError('No connection. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canManage || saving
  const model = ASSISTANT_MODELS[form.model]
  // A rough guide: a typical answer is two calls (a search, then the reply), reading ~5,000 cached tokens of
  // instructions, ~1,600 new tokens (the chat and search results) and writing ~600 (its thinking and the reply).
  const perAnswer = (5000 * model.cacheRead + 1600 * model.input + 600 * model.output) / 1_000_000
  const answersPerDay = perAnswer > 0 ? Math.floor(form.dailyBudgetUsd / perAnswer) : 0

  return (
    <div className={styles.settings}>
      <section className={styles.panel}>
        <div className={styles.switchRow}>
          <div>
            <h2>Show the chat on the shop</h2>
            <p className={ui.muted}>Shoppers see a chat button in the bottom corner (the one the WhatsApp button leaves free). Switch it off at any time; it disappears within 30 seconds.</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} disabled={disabled} />
            <span>{form.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        {!keyConfigured ? (
          <p className={`${ui.alert} ${styles.notice}`}>The Claude API key is not set on the server yet, so typed questions are answered with your shop&apos;s own search (no AI) and the buttons work as usual. See the setup steps in the docs (ANTHROPIC_API_KEY).</p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <h2>AI model and daily budget</h2>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>Model</span>
            <select className={ui.input} value={form.model} onChange={e => set('model', e.target.value as AssistantModel)} disabled={disabled}>
              {(Object.keys(ASSISTANT_MODELS) as AssistantModel[]).map(id => <option key={id} value={id}>{ASSISTANT_MODELS[id].label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>Daily budget (US dollars)</span>
            <NumInput className={ui.input} decimals min={0} max={100} step={0.5} value={form.dailyBudgetUsd} empty={0} onValue={v => set('dailyBudgetUsd', Math.max(0, Math.min(100, v ?? 0)))} disabled={disabled} />
          </label>
        </div>
        <p className={ui.fieldHelp}>
          About ${perAnswer.toFixed(perAnswer < 0.01 ? 4 : 3)} per typed question with this model, so roughly {answersPerDay.toLocaleString()} AI answers a day on ${form.dailyBudgetUsd}.
          When the day&apos;s budget is used up, typed questions get your shop&apos;s own search results until midnight (UTC). The buttons never use the AI and are always free. Set 0 to never use the AI.
        </p>
      </section>

      <section className={styles.panel}>
        <h2>Opening message</h2>
        <p className={ui.muted}>&#123;store&#125; becomes your store name.</p>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>English</span>
            <textarea className={ui.textarea} rows={3} maxLength={400} value={form.welcome} onChange={e => set('welcome', e.target.value)} disabled={disabled} />
          </label>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>Arabic</span>
            <textarea className={ui.textarea} rows={3} maxLength={400} dir="rtl" value={form.welcomeAr} onChange={e => set('welcomeAr', e.target.value)} disabled={disabled} />
          </label>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Buttons under the opening message</h2>
        <p className={ui.muted}>Up to 8. A button either runs a built-in action (free, no AI) or sends a question you write (answered by the AI).</p>
        <ul className={styles.suggestions}>
          {form.suggestions.map((s, i) => (
            <li key={i} className={styles.suggestion}>
              <input className={ui.input} aria-label={`Button ${i + 1} label`} placeholder="Label" maxLength={40} value={s.label} onChange={e => setSuggestion(i, { label: e.target.value })} disabled={disabled} />
              <input className={ui.input} aria-label={`Button ${i + 1} Arabic label`} placeholder="Arabic label" dir="rtl" maxLength={40} value={s.labelAr} onChange={e => setSuggestion(i, { labelAr: e.target.value })} disabled={disabled} />
              <select className={ui.input} aria-label={`Button ${i + 1} does`} value={s.action || 'message'} onChange={e => setSuggestion(i, e.target.value === 'message' ? { action: undefined, message: s.message || s.label } : { action: e.target.value as QuickAction, message: undefined })} disabled={disabled}>
                {QUICK_ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                <option value="message">Ask a question (AI)…</option>
              </select>
              {!s.action ? <input className={`${ui.input} ${styles.wide}`} aria-label={`Button ${i + 1} question`} placeholder="The question it sends, e.g. Gift ideas under $30" maxLength={200} value={s.message || ''} onChange={e => setSuggestion(i, { message: e.target.value })} disabled={disabled} /> : null}
              <div className={styles.rowActions}>
                <button type="button" className={ui.iconBtn} onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move button ${i + 1} up`}><ArrowUp size={15} /></button>
                <button type="button" className={ui.iconBtn} onClick={() => move(i, 1)} disabled={disabled || i === form.suggestions.length - 1} aria-label={`Move button ${i + 1} down`}><ArrowDown size={15} /></button>
                <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} onClick={() => set('suggestions', form.suggestions.filter((_, j) => j !== i))} disabled={disabled} aria-label={`Remove button ${i + 1}`}><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
        {form.suggestions.length < 8 ? (
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => set('suggestions', [...form.suggestions, { label: '', labelAr: '', action: 'find_product' }])} disabled={disabled}><Plus size={15} /> Add a button</button>
        ) : null}
      </section>

      <section className={styles.panel}>
        <h2>When a shopper needs a person</h2>
        <p className={ui.muted}>The chat shows your WhatsApp and email (Settings › Store contact) with this note. It never claims a team member was contacted.</p>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>Note (English)</span>
            <input className={ui.input} maxLength={300} placeholder="Our team will reply as soon as they can." value={form.supportNote} onChange={e => set('supportNote', e.target.value)} disabled={disabled} />
          </label>
          <label className={styles.field}>
            <span className={ui.fieldLabel}>Note (Arabic)</span>
            <input className={ui.input} maxLength={300} dir="rtl" value={form.supportNoteAr} onChange={e => set('supportNoteAr', e.target.value)} disabled={disabled} />
          </label>
        </div>
      </section>

      {canManage ? <UnsavedBar dirty={dirty} saving={saving} error={error} onDiscard={() => { setForm(saved); setError('') }} onSave={save} /> : null}
    </div>
  )
}

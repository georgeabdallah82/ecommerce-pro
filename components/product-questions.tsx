'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, MessageCircleQuestion } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { dateLocale } from '@/lib/i18n'

type Question = { id: string; name: string; question: string; answer: string | null; answeredAt: string | Date | null }

// "Questions & answers" on the product page (lib/product-questions.ts): answers the owner
// published, and a short form to ask a new one. Questions stay private until answered.
export default function ProductQuestions({ productId, questions }: { productId: string; questions: Question[] }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('Please add your name.')); return }
    if (question.trim().length < 5) { setError(t('Please write your question.')); return }
    setBusy(true)
    try {
      const r = await fetch('/api/questions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, name, question, phone, website }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(t(String(d.error || 'Something went wrong. Please try again.')))
      setSent(true)
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  // With no question yet the section says so, beside the button; it was a heading and a button on their own.
  const empty = questions.length === 0 && !open && !sent
  return <div className={`aliContainer aliQuestions${empty ? ' aliQaEmpty' : ''}`} id="questions">
    <h2>{t('Questions & answers')}</h2>
    {empty && <p className="aliQaNone">{t('No questions yet. Ask one and we will answer it here.')}</p>}
    {questions.length > 0
      ? <div className="aliQaList">{questions.map(q => <div className="aliQaItem" key={q.id}>
        <p className="aliQaQ"><span aria-hidden="true">{t('Q:')}</span> <span dir="auto">{q.question}</span></p>
        <p className="aliQaA"><span aria-hidden="true">{t('A:')}</span> <span dir="auto">{q.answer}</span></p>
        <small>{t('Asked by {name}', { name: q.name || t('Customer') })}{q.answeredAt ? ` · ${new Date(q.answeredAt).toLocaleDateString(dateLocale(lang))}` : ''}</small>
      </div>)}</div>
      : null}
    {sent
      ? <p className="aliQaSent" role="status"><CheckCircle2 size={18} /> {t('Thank you! We will answer soon. If you left your WhatsApp number, we will message you the answer.')}</p>
      : !open
        ? <button type="button" className="aliQaAsk" onClick={() => setOpen(true)}><MessageCircleQuestion size={18} /> {t('Ask a question')}</button>
        : <form className="aliQaForm" onSubmit={submit} noValidate>
          <label><span>{t('Your question')}</span>
            <textarea rows={3} maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} placeholder={t('e.g. Is it suitable for children?')} dir="auto" required />
          </label>
          <label><span>{t('Your name')}</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="given-name" dir="auto" required />
          </label>
          <label><span>{t('WhatsApp number (optional)')}</span>
            <input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('e.g. 70 123 456')} maxLength={40} />
            <small>{t('Only to tell you the answer. Not shown on the website.')}</small>
          </label>
          <input className="aliQaTrap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} name="website" />
          {error && <p className="aliReviewFormError" role="alert">{error}</p>}
          <button type="submit" className="aliQaAsk" disabled={busy}>{busy ? t('Sending…') : t('Send my question')}</button>
        </form>}
  </div>
}

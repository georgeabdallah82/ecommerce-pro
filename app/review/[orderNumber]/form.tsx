'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CheckCircle2, Star } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { markT } from '@/lib/i18n'
import ReviewPhotoPicker from '@/components/review-photo-picker'
import s from './review.module.css'

type Product = { id: string; name: string; slug: string; image: string; alt: string; rated: boolean }

const STAR_WORDS = [markT('Poor'), markT('Fair'), markT('Good'), markT('Very good'), markT('Excellent')]

export default function OrderReviewForm({ orderNumber, token, defaultName, products }: { orderNumber: string; token: string; defaultName: string; products: Product[] }) {
  const { t } = useI18n()
  const [name, setName] = useState(defaultName)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Record<string, string[]>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const open = products.filter(p => !p.rated)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const reviews = open.filter(p => ratings[p.id]).map(p => ({ productId: p.id, rating: ratings[p.id], body: (bodies[p.id] || '').trim(), photos: photos[p.id] || [] }))
    if (!reviews.length) { setError(t('Choose a star rating for at least one product.')); return }
    if (!name.trim()) { setError(t('Please add your name.')); return }
    setBusy(true)
    try {
      const r = await fetch('/api/reviews/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderNumber, token, name, reviews }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(t(String(d.error || 'Unable to submit review right now')))
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Unable to submit review right now'))
    } finally {
      setBusy(false)
    }
  }

  if (done || !open.length) {
    return <main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.center}`}>
      <span className={`${s.badge} ${s.badgeOk}`}><CheckCircle2 size={32} /></span>
      <h1 className={s.title}>{t('Thank you for your review!')}</h1>
      <p className={s.lead}>{t('It will appear on our website after a quick check. It really helps other customers.')}</p>
      <Link className={`${s.btn} ${s.btnPrimary}`} href="/shop">{t('Continue shopping')}</Link>
    </section></div></main>
  }

  return <main className={s.page}><form className={s.wrap} onSubmit={submit} noValidate>
    <header className={s.head}>
      <h1 className={s.title}>{t('How was your order?')}</h1>
      <p className={s.lead}>{t('Order #{order}. Tap the stars to rate each product. A comment is optional.', { order: orderNumber })}</p>
    </header>

    {products.map(p => {
      const rating = ratings[p.id] || 0
      return <section key={p.id} className={s.card}>
        <div className={s.product}>
          {p.image ? <img className={s.thumb} src={p.image} alt={p.alt} width={64} height={64} loading="lazy" /> : <span className={s.thumb} aria-hidden="true" />}
          <strong className={s.name}>{p.name}</strong>
        </div>
        {p.rated
          ? <p className={s.rated}><CheckCircle2 size={16} /> {t('Already rated. Thank you!')}</p>
          : <>
            <div className={s.stars} role="radiogroup" aria-label={t('Rating for {name}', { name: p.name })}>
              {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('{n} out of 5 stars', { n })}
                className={`${s.star} ${n <= rating ? s.starOn : ''}`} onClick={() => { setRatings(r => ({ ...r, [p.id]: n })); setError('') }}><Star size={34} /></button>)}
              <span className={s.starWord} aria-hidden="true">{rating ? t(STAR_WORDS[rating - 1]) : ''}</span>
            </div>
            {rating > 0 && <label className={s.field}><span>{t('Your comment (optional)')}</span>
              <textarea rows={3} maxLength={2000} value={bodies[p.id] || ''} onChange={e => setBodies(b => ({ ...b, [p.id]: e.target.value }))} placeholder={t('What did you like? How is the quality?')} dir="auto" />
            </label>}
            {rating > 0 && <ReviewPhotoPicker orderNumber={orderNumber} token={token} photos={photos[p.id] || []}
              onChange={list => setPhotos(current => ({ ...current, [p.id]: list }))}
              onBusy={busyNow => setUploading(current => ({ ...current, [p.id]: busyNow }))} />}
          </>}
      </section>
    })}

    <section className={s.card}>
      <label className={s.field}><span>{t('Your name')}</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="name" dir="auto" />
        <small>{t('Shown with your review as first name and initial, for example "Maya H."')}</small>
      </label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <button className={`${s.btn} ${s.btnPrimary}`} type="submit" disabled={busy || Object.values(uploading).some(Boolean)}>{busy ? t('Sending…') : Object.values(uploading).some(Boolean) ? t('Adding photo…') : t('Send my review')}</button>
    </section>
  </form></main>
}

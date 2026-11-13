'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, RefreshCw, Timer, Truck } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { dateLocale, statusLabel } from '@/lib/i18n'

type Tracking = {
  active: boolean
  status: string
  fulfillmentStatus: string
  etaMinutes: number | null
  position: { latitude: number; longitude: number } | null
  locationUpdatedAt: string | null
  locationFresh: boolean
  pollingSeconds: number
}

function mapUrl(position: Tracking['position']) {
  if (!position) return ''
  return `https://www.google.com/maps?q=${position.latitude},${position.longitude}&z=14&output=embed`
}

export default function DeliveryTrackingMap({ token, initial }: { token: string; initial: Tracking | null }) {
  const { t, lang } = useI18n()
  // Refresh now: runs the same check as the timer, without reloading the page.
  const [tick, setTick] = useState(0)
  const [tracking, setTracking] = useState<Tracking | null>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/tracking/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || t('Unable to load tracking'))
        if (!cancelled) { setTracking(data); setError('') }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('Unable to load tracking'))
      } finally { if (!cancelled) setLoading(false) }
    }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [token, tick])

  const embed = useMemo(() => mapUrl(tracking?.position || null), [tracking?.position])
  if (!tracking) return <div className="card" style={{padding:20}}>{t('Tracking information is not available.')}</div>

  // The page's heading, the order's status in the shopper's language and its colour (app/storefront-account.css), two
  // tiles, the map and when it updates (app/storefront-content.css). The cards had no space between them.
  const updated = tracking.locationUpdatedAt ? new Date(tracking.locationUpdatedAt).toLocaleString(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'short' }) : ''
  return <div className="trackPage">
    <section className="card trackCard">
      <div className="trackHead">
        <div><span className="trackEyebrow">{t('DELIVERY')}</span><h1 className="trackTitle">{tracking.active ? t('Your delivery is on the way') : t('Delivery tracking')}</h1></div>
        <span className="pill" data-status={tracking.status}><Truck size={14} aria-hidden="true" /> {statusLabel(t, tracking.status)}</span>
      </div>
      <div className="trackTiles">
        <div className="trackTile"><span className="trackTileIcon" aria-hidden="true"><Timer size={18} /></span><span className="muted">{t('ETA')}</span><strong>{tracking.active && tracking.etaMinutes !== null ? t('{n} min', { n: tracking.etaMinutes }) : '—'}</strong></div>
        <div className="trackTile"><span className="trackTileIcon" aria-hidden="true"><MapPin size={18} /></span><span className="muted">{t('Location status')}</span><strong>{tracking.active ? (tracking.locationFresh ? t('Updated just now') : t('Update may be delayed')) : t('Not live')}</strong>{updated && <small className="muted">{updated}</small>}</div>
      </div>
    </section>
    {error && <div className="alert" role="alert">{error}</div>}
    {embed ? <div className="trackMap"><iframe title={t('Live delivery location')} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div> : <div className="card trackNoMap"><MapPin size={16} aria-hidden="true" /> {t('The courier has not shared a location yet.')}</div>}
    <div className="trackFoot"><span className="muted"><Clock3 size={14} aria-hidden="true" /> {t('Updates every 15 seconds while this page is open.')}</span><button className="btn secondary" type="button" onClick={() => setTick(n => n + 1)} disabled={loading} aria-busy={loading}><RefreshCw size={14} aria-hidden="true" /> {t('Refresh')}</button></div>
  </div>
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, RefreshCw, Truck } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

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

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function mapUrl(position: Tracking['position']) {
  if (!position) return ''
  return `https://www.google.com/maps?q=${position.latitude},${position.longitude}&z=14&output=embed`
}

export default function DeliveryTrackingMap({ token, initial }: { token: string; initial: Tracking | null }) {
  const { t } = useI18n()
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
  }, [token])

  const embed = useMemo(() => mapUrl(tracking?.position || null), [tracking?.position])
  if (!tracking) return <div className="card" style={{padding:20}}>{t('Tracking information is not available.')}</div>

  return <div className="space-y-4">
    <div className="card" style={{padding:20}}>
      <div className="sectionHead small"><div><span className="muted tiny">{t('DELIVERY')}</span><h2 className="h2">{tracking.active ? t('Your delivery is on the way') : t('Delivery tracking')}</h2></div><span className="pill"><Truck size={14}/> {statusLabel(tracking.status)}</span></div>
      <div className="grid twoColumn" style={{marginTop:14}}>
        <div className="card" style={{padding:14}}><span className="muted">{t('ETA')}</span><strong style={{display:'block',marginTop:5,fontSize:24}}>{tracking.active && tracking.etaMinutes !== null ? t('{n} min', { n: tracking.etaMinutes }) : '—'}</strong></div>
        <div className="card" style={{padding:14}}><span className="muted">{t('Location status')}</span><strong style={{display:'block',marginTop:5}}>{tracking.active ? (tracking.locationFresh ? t('Updated just now') : t('Update may be delayed')) : t('Not live')}</strong>{tracking.locationUpdatedAt&&<small className="muted">{new Date(tracking.locationUpdatedAt).toLocaleString()}</small>}</div>
      </div>
    </div>
    {error&&<div className="alert">{error}</div>}
    {embed ? <div className="card" style={{padding:0,overflow:'hidden'}}><iframe title={t('Live delivery location')} src={embed} style={{width:'100%',height:430,border:0}} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div> : <div className="card" style={{padding:20}}><MapPin size={16}/> {t('The courier has not shared a location yet.')}</div>}
    <div className="inline" style={{justifyContent:'space-between'}}><span className="muted"><Clock3 size={14}/> {t('Updates every 15 seconds while this page is open.')}</span><button className="btn secondary" onClick={()=>location.reload()} disabled={loading}><RefreshCw size={14}/> {t('Refresh')}</button></div>
  </div>
}

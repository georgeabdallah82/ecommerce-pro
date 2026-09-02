'use client'

import { useEffect, useState } from 'react'
import { LocateFixed, Copy, Check, Navigation, Clock3 } from 'lucide-react'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function DeliveryTrackingAdmin({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [active, setActive] = useState(false)
  const [eta, setEta] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api(`/api/admin/orders/${orderId}/delivery-tracking`)
      .then(data => {
        const tracking = data.tracking
        if (!tracking) return
        setActive(Boolean(tracking.active))
        setEta(tracking.etaMinutes == null ? '' : String(tracking.etaMinutes))
        setPublicUrl(tracking.publicUrl || '')
        setUpdatedAt(tracking.lastLocationUpdatedAt || null)
      })
      .catch(() => {})
  }, [orderId])

  const canTrack = orderStatus === 'PROCESSING' || orderStatus === 'SHIPPED'

  async function updateLocation() {
    if (!navigator.geolocation) { setMessage('This device does not support location.'); return }
    setSaving(true); setMessage('')
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const data = await api(`/api/admin/orders/${orderId}/delivery-tracking`, {
          method: 'PATCH',
          body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, etaMinutes: eta === '' ? null : Number(eta), active: true }),
        })
        const tracking = data.tracking
        setActive(true); setPublicUrl(tracking.publicUrl || ''); setUpdatedAt(tracking.lastLocationUpdatedAt || new Date().toISOString()); setMessage('Delivery location updated.')
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update delivery location') }
      finally { setSaving(false) }
    }, () => { setSaving(false); setMessage('Location permission was not granted.') }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 })
  }

  async function disableTracking() {
    setSaving(true); setMessage('')
    try { const data = await api(`/api/admin/orders/${orderId}/delivery-tracking`, { method: 'PATCH', body: JSON.stringify({ active: false }) }); setActive(false); setUpdatedAt(null); setEta(''); setPublicUrl(data.tracking?.publicUrl || publicUrl); setMessage('Delivery tracking disabled.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to disable tracking') }
    finally { setSaving(false) }
  }

  async function copyLink() {
    if (!publicUrl) return
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch {}
  }

  return <section className="card adminPanel">
    <div className="sectionHead small"><div><h3>Live delivery tracking</h3><span className="muted">Share an approximate courier position with the customer.</span></div><Navigation size={18} /></div>
    {!canTrack && <p className="muted">Tracking becomes available when the order is PROCESSING or SHIPPED.</p>}
    {canTrack && <>
      <div className="twoColFields">
        <label className="fieldLabel">ETA (minutes)<input className="input" inputMode="numeric" min="0" max="1440" value={eta} onChange={e=>setEta(e.target.value.replace(/\D/g,''))} placeholder="e.g. 25" /></label>
        <div className="fieldLabel"><span>Current status</span><div className="inline" style={{minHeight:40}}><span className="pill">{active ? 'LIVE' : 'OFF'}</span>{updatedAt&&<span className="muted"><Clock3 size={13}/> {new Date(updatedAt).toLocaleTimeString()}</span>}</div></div>
      </div>
      <div className="inline" style={{marginTop:12,flexWrap:'wrap'}}>
        <button className="btn" onClick={updateLocation} disabled={saving}><LocateFixed size={15}/>{saving?'Updating…':'Use my current location'}</button>
        {active&&<button className="btn secondary" onClick={disableTracking} disabled={saving}>Stop tracking</button>}
        {publicUrl&&<button className="btn ghost" onClick={copyLink}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy tracking link'}</button>}
      </div>
      {message&&<p className="muted" style={{marginTop:10}}>{message}</p>}
      {publicUrl&&<p className="muted" style={{marginTop:10,wordBreak:'break-all'}}>Customer link: {publicUrl}</p>}
    </>}
  </section>
}

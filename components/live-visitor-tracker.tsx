'use client'

import { useEffect, useState } from 'react'

const LOCATION_CONSENT_KEY = 'live_visitor_precise_location_consent'
type Coordinates = { latitude: number; longitude: number }

function detectDevice() { const width = window.innerWidth; return width < 768 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop' }
function detectBrowser() { const ua = navigator.userAgent; if (/Edg\//.test(ua)) return 'Edge'; if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'; if (/Firefox\//.test(ua)) return 'Firefox'; if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'; return 'Other' }
function detectOS() { const ua = navigator.userAgent; if (/Android/i.test(ua)) return 'Android'; if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'; if (/Windows/i.test(ua)) return 'Windows'; if (/Mac OS X/i.test(ua)) return 'macOS'; if (/Linux/i.test(ua)) return 'Linux'; return 'Other' }
function readConsent() { try { return window.localStorage.getItem(LOCATION_CONSENT_KEY) } catch { return null } }

export default function LiveVisitorTracker() {
  const [consent, setConsent] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState('')

  useEffect(() => { if (!window.location.pathname.startsWith('/admin')) setConsent(readConsent()) }, [])

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin') || consent !== 'granted') return
    navigator.geolocation.getCurrentPosition(
      position => setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setLocationError('Precise location is unavailable. You can continue without it.'),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
  }, [consent])

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return
    let stopped = false
    const send = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        await fetch('/api/analytics/visitor', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({
            path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
            referrer: document.referrer || null, device: detectDevice(), browser: detectBrowser(), os: detectOS(),
            latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
            locationSource: coordinates ? 'browser' : undefined,
          }),
        })
      } catch { /* analytics must never affect the storefront */ }
    }
    send()
    const timer = window.setInterval(send, 30_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') send() }
    document.addEventListener('visibilitychange', onVisibility)
    const onPageHide = () => { stopped = true; void fetch('/api/analytics/visitor', { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => {}) }
    window.addEventListener('pagehide', onPageHide)
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide) }
  }, [coordinates])

  if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin') || consent !== null) return null

  const allowLocation = () => {
    if (!navigator.geolocation) { setLocationError('This browser does not support precise location.'); return }
    navigator.geolocation.getCurrentPosition(
      position => { setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setConsent('granted'); setLocationError(''); try { window.localStorage.setItem(LOCATION_CONSENT_KEY, 'granted') } catch {} },
      () => { setConsent('denied'); try { window.localStorage.setItem(LOCATION_CONSENT_KEY, 'denied') } catch {} },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
  }
  const declineLocation = () => { setConsent('denied'); try { window.localStorage.setItem(LOCATION_CONSENT_KEY, 'denied') } catch {} }

  return <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-2xl">
    <div className="text-sm font-semibold">Share precise location?</div>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Allow this site to use your device location for its live visitor analytics. You can decline and continue normally.</p>
    {locationError && <p className="mt-2 text-xs text-muted-foreground">{locationError}</p>}
    <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={declineLocation} className="rounded-lg border px-3 py-2 text-xs font-medium">Not now</button><button type="button" onClick={allowLocation} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Allow precise location</button></div>
  </div>
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, ShieldCheck, X, Navigation } from 'lucide-react'

const LOCATION_CONSENT_KEY = 'live_visitor_precise_location_consent'
type Coordinates = { latitude: number; longitude: number }

function detectDevice() {
  const width = window.innerWidth
  return width < 768 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop'
}

function detectBrowser() {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  return 'Other'
}

function detectOS() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Other'
}

function readConsent() {
  try {
    return window.localStorage.getItem(LOCATION_CONSENT_KEY)
  } catch {
    return null
  }
}

function storeConsent(value: 'granted' | 'denied') {
  try {
    window.localStorage.setItem(LOCATION_CONSENT_KEY, value)
  } catch {
    // localStorage can be unavailable in private or restricted contexts.
  }
}

export default function LiveVisitorTracker() {
  const [consent, setConsent] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState('')
  const coordinatesRef = useRef<Coordinates | null>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!window.location.pathname.startsWith('/admin')) {
      setConsent(readConsent())
    }
  }, [])

  useEffect(() => {
    coordinatesRef.current = coordinates
  }, [coordinates])

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin') || consent !== 'granted') return
    if (!navigator.geolocation) {
      setLocationError('This browser does not support precise location.')
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setLocationError('')
      },
      () => {
        setLocationError('Precise location is currently unavailable. Live browsing still works normally.')
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [consent])

  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return
    let stopped = false

    const send = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      const currentCoordinates = coordinatesRef.current
      try {
        await fetch('/api/analytics/visitor', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
            referrer: document.referrer || null,
            device: detectDevice(),
            browser: detectBrowser(),
            os: detectOS(),
            latitude: currentCoordinates?.latitude ?? null,
            longitude: currentCoordinates?.longitude ?? null,
            locationSource: currentCoordinates ? 'browser' : undefined,
          }),
        })
      } catch {
        // Analytics must never affect the storefront.
      }
    }

    send()
    const timer = window.setInterval(send, 15_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') send()
    }
    const onPageHide = () => {
      stopped = true
      void fetch('/api/analytics/visitor', {
        method: 'DELETE',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {})
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin') || consent !== null) {
    return null
  }

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('This browser does not support precise location.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const nextCoordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        coordinatesRef.current = nextCoordinates
        setCoordinates(nextCoordinates)
        setConsent('granted')
        setLocationError('')
        storeConsent('granted')
      },
      () => {
        setConsent('denied')
        storeConsent('denied')
        setLocationError('')
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    )
  }

  const declineLocation = () => {
    setConsent('denied')
    storeConsent('denied')
  }

  return (
    <div className="lv-consent-root" role="dialog" aria-modal="true" aria-labelledby="lv-consent-title">
      <style jsx>{`
        .lv-consent-root{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:24px;background:rgba(17,17,15,.34);backdrop-filter:blur(4px);animation:lv-fade .18s ease-out}
        .lv-consent-card{width:min(460px,100%);overflow:hidden;border:1px solid rgba(232,232,227,.98);border-radius:24px;background:#fff;color:var(--ink);box-shadow:0 28px 80px rgba(0,0,0,.22);animation:lv-rise .22s ease-out}
        .lv-consent-top{display:flex;align-items:flex-start;gap:14px;padding:22px 22px 16px}
        .lv-consent-icon{display:grid;width:48px;height:48px;flex:0 0 48px;place-items:center;border-radius:15px;background:#f0f6ef;color:#1c6b31}
        .lv-consent-copy{min-width:0;flex:1}
        .lv-consent-eyebrow{font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#3f6e48}
        .lv-consent-title{margin:4px 0 0;font-size:19px;line-height:1.25;letter-spacing:-.025em}
        .lv-consent-description{margin:7px 0 0;color:#676762;font-size:13px;line-height:1.62}
        .lv-consent-close{display:grid;width:32px;height:32px;flex:0 0 32px;place-items:center;border:1px solid #e8e8e3;border-radius:9px;background:#fff;color:#6d6d67;cursor:pointer}
        .lv-consent-close:hover{background:#f7f7f3;color:#171717}
        .lv-consent-benefits{display:grid;gap:8px;margin:0 22px;padding:13px 14px;border:1px solid #ecece7;border-radius:14px;background:#fafaf8}
        .lv-consent-benefit{display:flex;align-items:flex-start;gap:9px;color:#42423e;font-size:11px;line-height:1.45}
        .lv-consent-benefit svg{flex:0 0 14px;margin-top:1px;color:#23743a}
        .lv-consent-footer{padding:16px 22px 20px}
        .lv-consent-note{display:flex;align-items:center;gap:7px;margin-bottom:13px;color:#777770;font-size:10px;line-height:1.45}
        .lv-consent-note svg{flex:0 0 14px}
        .lv-consent-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:9px}
        .lv-consent-btn{min-height:44px;border-radius:11px;padding:0 15px;border:1px solid #deded8;background:#fff;color:#343430;font-size:12px;font-weight:800;cursor:pointer}
        .lv-consent-btn:hover{background:#f7f7f3}
        .lv-consent-btn.primary{border-color:#171717;background:#171717;color:#fff}
        .lv-consent-btn.primary:hover{background:#2b2b29}
        .lv-consent-error{margin:0 22px 14px;padding:9px 11px;border:1px solid #ffd1cd;border-radius:10px;background:#fff5f4;color:#98261b;font-size:10px;line-height:1.45}
        @keyframes lv-fade{from{opacity:0}to{opacity:1}}
        @keyframes lv-rise{from{transform:translateY(18px);opacity:.88}to{transform:translateY(0);opacity:1}}
        @media(max-width:600px){.lv-consent-root{align-items:flex-end;padding:12px}.lv-consent-card{border-radius:20px}.lv-consent-top{padding:19px 18px 14px}.lv-consent-benefits{margin:0 18px}.lv-consent-footer{padding:14px 18px 18px}.lv-consent-actions{grid-template-columns:1fr}.lv-consent-btn.primary{order:-1}}
      `}</style>

      <div className="lv-consent-card">
        <div className="lv-consent-top">
          <div className="lv-consent-icon"><MapPin size={23} /></div>
          <div className="lv-consent-copy">
            <div className="lv-consent-eyebrow">Optional location sharing</div>
            <h2 id="lv-consent-title" className="lv-consent-title">Share your precise location?</h2>
            <p className="lv-consent-description">Allow this store to use your device location for its live visitor map. You can continue shopping normally without sharing it.</p>
          </div>
          <button type="button" className="lv-consent-close" onClick={declineLocation} aria-label="Continue without sharing location"><X size={16} /></button>
        </div>

        <div className="lv-consent-benefits">
          <div className="lv-consent-benefit"><Navigation size={14} /><span>Your location can appear as a precise point on the store's live visitor map.</span></div>
          <div className="lv-consent-benefit"><ShieldCheck size={14} /><span>Location sharing is optional. Declining does not block the website or checkout.</span></div>
        </div>

        {locationError && <div className="lv-consent-error">{locationError}</div>}

        <div className="lv-consent-footer">
          <div className="lv-consent-note"><ShieldCheck size={14} /><span>Your choice is remembered on this device. Precise location is requested only after you press Allow.</span></div>
          <div className="lv-consent-actions">
            <button type="button" className="lv-consent-btn" onClick={declineLocation}>Continue without it</button>
            <button type="button" className="lv-consent-btn primary" onClick={allowLocation}>Allow precise location</button>
          </div>
        </div>
      </div>
    </div>
  )
}

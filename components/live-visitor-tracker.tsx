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
  const [mounted, setMounted] = useState(false)
  const [consent, setConsent] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState('')
  const coordinatesRef = useRef<Coordinates | null>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
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

  if (!mounted || typeof window === 'undefined' || window.location.pathname.startsWith('/admin') || consent !== null) {
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
    <div className="lv-consent-root" role="region" aria-label="Location preference">
      <style jsx>{`
        .lv-consent-root{position:fixed;bottom:24px;left:24px;z-index:45;pointer-events:auto;animation:lv-rise .25s ease-out}
        .lv-consent-card{width:min(380px,calc(100vw - 32px));overflow:hidden;border:1px solid rgba(232,232,227,.98);border-radius:18px;background:#fff;color:#191512;box-shadow:0 16px 48px rgba(0,0,0,.15)}
        .lv-consent-top{display:flex;align-items:flex-start;gap:12px;padding:16px 16px 12px}
        .lv-consent-icon{display:grid;width:38px;height:38px;flex:0 0 38px;place-items:center;border-radius:11px;background:#f0f6ef;color:#1c6b31}
        .lv-consent-copy{min-width:0;flex:1}
        .lv-consent-eyebrow{font-size:9.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#3f6e48}
        .lv-consent-title{margin:2px 0 0;font-size:15px;line-height:1.25;font-weight:800;letter-spacing:-.02em}
        .lv-consent-description{margin:4px 0 0;color:#676762;font-size:12px;line-height:1.5}
        .lv-consent-close{display:grid;width:28px;height:28px;flex:0 0 28px;place-items:center;border:1px solid #e8e8e3;border-radius:8px;background:#fff;color:#6d6d67;cursor:pointer}
        .lv-consent-close:hover{background:#f7f7f3;color:#171717}
        .lv-consent-footer{padding:8px 16px 16px}
        .lv-consent-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .lv-consent-btn{min-height:36px;border-radius:9px;padding:0 10px;border:1px solid #deded8;background:#fff;color:#343430;font-size:11.5px;font-weight:800;cursor:pointer;transition:all .15s ease}
        .lv-consent-btn:hover{background:#f7f7f3}
        .lv-consent-btn.primary{border-color:#171717;background:#171717;color:#fff}
        .lv-consent-btn.primary:hover{background:#2b2b29}
        .lv-consent-error{margin:0 16px 8px;padding:6px 10px;border:1px solid #ffd1cd;border-radius:8px;background:#fff5f4;color:#98261b;font-size:10px}
        @keyframes lv-rise{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media(max-width:600px){.lv-consent-root{bottom:16px;left:16px;right:16px}.lv-consent-card{width:100%}}
      `}</style>

      <div className="lv-consent-card">
        <div className="lv-consent-top">
          <div className="lv-consent-icon"><MapPin size={19} /></div>
          <div className="lv-consent-copy">
            <div className="lv-consent-eyebrow">Store Live Map</div>
            <h2 id="lv-consent-title" className="lv-consent-title">Share city for live map?</h2>
            <p className="lv-consent-description">Optional device location for our storefront live visitor activity map.</p>
          </div>
          <button type="button" className="lv-consent-close" onClick={declineLocation} aria-label="Dismiss"><X size={14} /></button>
        </div>

        {locationError && <div className="lv-consent-error">{locationError}</div>}

        <div className="lv-consent-footer">
          <div className="lv-consent-actions">
            <button type="button" className="lv-consent-btn" onClick={declineLocation}>Not now</button>
            <button type="button" className="lv-consent-btn primary" onClick={allowLocation}>Allow</button>
          </div>
        </div>
      </div>
    </div>
  )
}

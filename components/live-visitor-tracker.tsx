'use client'

import { useEffect, useRef, useState } from 'react'

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

// /theme-editor-preview (the theme editor's own iframe target, see
// app/theme-editor-preview/page.tsx) renders draft storefront markup for editing purposes only
// -- it must never prompt for location or report itself as a real visitor hit, the same way
// /admin already doesn't.
function isTrackedPath(pathname: string) {
  return !pathname.startsWith('/admin') && pathname !== '/theme-editor-preview'
}

function readConsent() {
  try {
    return window.localStorage.getItem(LOCATION_CONSENT_KEY)
  } catch {
    return null
  }
}

export default function LiveVisitorTracker() {
  const [consent, setConsent] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const coordinatesRef = useRef<Coordinates | null>(null)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (isTrackedPath(window.location.pathname)) {
      setConsent(readConsent())
    }
  }, [])

  useEffect(() => {
    coordinatesRef.current = coordinates
  }, [coordinates])

  useEffect(() => {
    if (!isTrackedPath(window.location.pathname) || consent !== 'granted') return
    if (!navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {},
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
    if (!isTrackedPath(window.location.pathname)) return
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

  // Shoppers are no longer asked for their location (it interrupted browsing); the live map
  // uses the visitor's network location instead. Precise location is only used for someone who
  // already said yes before.
  return null
}

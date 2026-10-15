'use client'

import { useEffect, useRef, useState } from 'react'
import { HEARTBEAT_MS, IDLE_STOP_MS, STAFF_PAUSE_KEY, STAFF_PAUSE_MS, isTrackedPath } from '@/lib/visitor-tracking'

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

// Which pages count and who is counted: lib/visitor-tracking.ts. /theme-editor-preview (the
// theme editor's own iframe target) and the admin never report or prompt for location; the
// path is checked at every report, so moving into the admin inside the same tab stops it too.

// This browser was recently seen signed in as staff (the server said so): don't report.
function staffPaused() {
  try { return Number(window.localStorage.getItem(STAFF_PAUSE_KEY) || 0) > Date.now() } catch { return false }
}
function pauseForStaff() {
  try { window.localStorage.setItem(STAFF_PAUSE_KEY, String(Date.now() + STAFF_PAUSE_MS)) } catch {}
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
    let stopped = staffPaused()
    let reported = false
    let lastActivity = Date.now()
    let lastSent = 0

    const send = async () => {
      if (stopped || document.visibilityState === 'hidden' || !isTrackedPath(window.location.pathname)) return
      // Nobody has touched the page for a while: stop until they do (see IDLE_STOP_MS).
      if (Date.now() - lastActivity > IDLE_STOP_MS) return
      lastSent = Date.now()
      const currentCoordinates = coordinatesRef.current
      try {
        const response = await fetch('/api/analytics/visitor', {
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
        const result = await response.json().catch(() => null)
        // Signed in as staff: not a visitor. Stop reporting from this browser for a while.
        if (result?.staff) { stopped = true; pauseForStaff(); return }
        if (result?.tracked !== false) reported = true
      } catch {
        // Analytics must never affect the storefront.
      }
    }

    send()
    const timer = window.setInterval(send, HEARTBEAT_MS)
    // Any sign of life restarts reporting after an idle stop, straight away.
    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity > IDLE_STOP_MS
      lastActivity = Date.now()
      if (wasIdle && Date.now() - lastSent > HEARTBEAT_MS) send()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      lastActivity = Date.now()
      send()
    }
    const onPageHide = () => {
      if (!reported || stopped) return
      stopped = true
      void fetch('/api/analytics/visitor', {
        method: 'DELETE',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {})
    }
    // Back/forward can bring the same page back from the browser's memory after pagehide.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      stopped = staffPaused()
      lastActivity = Date.now()
      send()
    }
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

    for (const name of activityEvents) window.addEventListener(name, onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      stopped = true
      window.clearInterval(timer)
      for (const name of activityEvents) window.removeEventListener(name, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  // Shoppers are no longer asked for their location (it interrupted browsing); the live map
  // uses the visitor's network location instead. Precise location is only used for someone who
  // already said yes before.
  return null
}

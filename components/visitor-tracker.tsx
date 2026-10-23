'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { HEARTBEAT_MS, IDLE_STOP_MS, STAFF_PAUSE_KEY, STAFF_PAUSE_MS, isTrackedPath } from '@/lib/visitor-tracking'

// Reports a shopper's page views and a heartbeat for Admin > Live visitors (rules and privacy notes in
// lib/visitor-tracking.ts). Nothing is shown to the shopper and nothing here can affect the store:
// every failure is swallowed.

const ENDPOINT = '/api/analytics/visit'
const SOURCE_TAGS = ['utm_source', 'utm_medium', 'fbclid', 'igshid', 'gclid', 'ttclid']

function staffPaused() {
  try { return Number(window.localStorage.getItem(STAFF_PAUSE_KEY) || 0) > Date.now() } catch { return false }
}
function pauseForStaff() {
  try { window.localStorage.setItem(STAFF_PAUSE_KEY, String(Date.now() + STAFF_PAUSE_MS)) } catch {}
}

// What is in the cart right now (the cart lives in this browser, see components/cart-provider.tsx).
function cartNow() {
  try {
    const items = JSON.parse(window.localStorage.getItem('ecom-cart-v1') || '[]')
    if (!Array.isArray(items)) return { cartItems: 0, cartValue: 0 }
    let cartItems = 0
    let cartValue = 0
    for (const item of items) {
      const quantity = Math.max(0, Math.floor(Number(item?.quantity) || 0))
      cartItems += quantity
      cartValue += quantity * Math.max(0, Math.floor(Number(item?.price) || 0))
    }
    return { cartItems, cartValue }
  } catch { return { cartItems: 0, cartValue: 0 } }
}

// Only the tags that say where a shopper came from; the rest of the address stays on their device.
function sourceTags() {
  try {
    const query = new URLSearchParams(window.location.search)
    const out = new URLSearchParams()
    for (const key of SOURCE_TAGS) { const value = query.get(key); if (value !== null) out.set(key, value.slice(0, 40)) }
    return out.toString()
  } catch { return '' }
}

export default function VisitorTracker() {
  const pathname = usePathname()
  const send = useRef<((kind: 'view' | 'ping') => void) | null>(null)
  const first = useRef(true)

  // One report per page the shopper opens (the store changes pages without reloading).
  useEffect(() => {
    if (!isTrackedPath(pathname || '/')) return
    send.current?.('view')
  }, [pathname])

  useEffect(() => {
    let stopped = staffPaused()
    let reported = false
    let lastActivity = Date.now()
    let lastSent = 0

    const post = async (kind: 'view' | 'ping') => {
      const path = window.location.pathname
      if (stopped || document.visibilityState === 'hidden' || !isTrackedPath(path)) return
      // Nobody has touched the page for a while: stop until they do (see IDLE_STOP_MS).
      if (kind === 'ping' && Date.now() - lastActivity > IDLE_STOP_MS) return
      lastSent = Date.now()
      const body: Record<string, unknown> = { kind, path, ...cartNow() }
      if (first.current && kind === 'view') {
        body.referrer = document.referrer || null
        body.tags = sourceTags()
        first.current = false
      }
      try {
        const response = await fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(body) })
        const result = await response.json().catch(() => null)
        // Signed in as staff: not a visitor. Stop reporting from this browser for a while.
        if (result?.staff) { stopped = true; pauseForStaff(); return }
        if (result?.tracked) reported = true
      } catch {
        // Analytics must never affect the store.
      }
    }
    send.current = post

    // The first view of this page load (later page changes are sent by the effect above).
    post('view')
    const timer = window.setInterval(() => post('ping'), HEARTBEAT_MS)
    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity > IDLE_STOP_MS
      lastActivity = Date.now()
      if (wasIdle && Date.now() - lastSent > HEARTBEAT_MS) post('ping')
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      lastActivity = Date.now()
      post('ping')
    }
    // The shopper closed the page: out of "online now" at once, but still counted in today's numbers.
    const onPageHide = () => {
      if (!reported || stopped) return
      try { navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify({ kind: 'leave' })], { type: 'application/json' })) } catch {}
    }
    // Back/forward can bring the same page back from the browser's memory after pagehide.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      stopped = staffPaused()
      lastActivity = Date.now()
      post('view')
    }
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    for (const name of activityEvents) window.addEventListener(name, onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      stopped = true
      send.current = null
      window.clearInterval(timer)
      for (const name of activityEvents) window.removeEventListener(name, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return null
}

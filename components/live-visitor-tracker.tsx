'use client'

import { useEffect } from 'react'

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

export default function LiveVisitorTracker() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) return

    let stopped = false
    const send = async () => {
      if (stopped || document.visibilityState === 'hidden') return
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
          }),
        })
      } catch { /* analytics must never affect the storefront */ }
    }

    send()
    const timer = window.setInterval(send, 30_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') send() }
    document.addEventListener('visibilitychange', onVisibility)
    const onPageHide = () => {
      stopped = true
      navigator.sendBeacon('/api/analytics/visitor', new Blob([JSON.stringify({})], { type: 'application/json' }))
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  return null
}

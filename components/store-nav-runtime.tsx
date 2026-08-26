'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import StoreNavFixed from './store-nav-fixed'

const REFRESH_MS = 30000

export default function StoreNavRuntime({ theme, navigation }: { theme: any; navigation: any[] }) {
  const pathname = usePathname() || '/'
  const [currentTheme, setCurrentTheme] = useState(theme)
  const [currentNavigation, setCurrentNavigation] = useState(navigation || [])
  const themeSignature = useRef(JSON.stringify(theme || {}))
  const navSignature = useRef(JSON.stringify(navigation || []))
  const inFlight = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (pathname.startsWith('/admin')) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    try {
      const res = await fetch('/api/storefront/theme', { cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal })
      if (!res.ok || controller.signal.aborted) return
      const data = await res.json()
      if (!data?.theme || controller.signal.aborted) return
      const nextThemeSignature = JSON.stringify(data.theme)
      const nextNavigation = Array.isArray(data.navigation) ? data.navigation : []
      const nextNavSignature = JSON.stringify(nextNavigation)
      if (nextThemeSignature !== themeSignature.current) { themeSignature.current = nextThemeSignature; setCurrentTheme(data.theme) }
      if (nextNavSignature !== navSignature.current) { navSignature.current = nextNavSignature; setCurrentNavigation(nextNavigation) }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // A storefront refresh is best-effort; keep the last known-good theme on transient failures.
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }, [pathname])

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    void refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    const onFocus = () => { void refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    let themeChannel: BroadcastChannel | null = null
    let navigationChannel: BroadcastChannel | null = null
    try {
      themeChannel = new BroadcastChannel('store-theme')
      themeChannel.onmessage = event => {
        if (event.data?.theme) { const serialized = JSON.stringify(event.data.theme); if (serialized !== themeSignature.current) { themeSignature.current = serialized; setCurrentTheme(event.data.theme) } }
        void refresh()
      }
    } catch {}
    try {
      navigationChannel = new BroadcastChannel('store-navigation')
      navigationChannel.onmessage = event => {
        if (Array.isArray(event.data?.navigation)) { const serialized = JSON.stringify(event.data.navigation); if (serialized !== navSignature.current) { navSignature.current = serialized; setCurrentNavigation(event.data.navigation) } }
        void refresh()
      }
    } catch {}
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      themeChannel?.close()
      navigationChannel?.close()
      inFlight.current?.abort()
    }
  }, [pathname, refresh])

  if (pathname.startsWith('/admin')) return null
  return <StoreNavFixed theme={currentTheme} navigation={currentNavigation} />
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { StoreNav } from './store-nav'

export default function StoreNavRuntime({ theme, navigation }: { theme: any; navigation: any[] }) {
  const pathname = usePathname() || '/'
  const [currentNavigation, setCurrentNavigation] = useState(navigation || [])
  const lastSerialized = useRef(JSON.stringify(navigation || []))

  const refresh = useCallback(async () => {
    if (pathname.startsWith('/admin')) return
    try {
      const res = await fetch('/api/navigation', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data.navigation)) return
      const serialized = JSON.stringify(data.navigation)
      if (serialized === lastSerialized.current) return
      lastSerialized.current = serialized
      setCurrentNavigation(data.navigation)
    } catch {}
  }, [pathname])

  useEffect(() => {
    if (pathname.startsWith('/admin')) return

    refresh()

    const timer = window.setInterval(refresh, 3000)
    const onFocus = () => refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('store-navigation')
      channel.onmessage = event => {
        if (Array.isArray(event.data?.navigation)) {
          const serialized = JSON.stringify(event.data.navigation)
          if (serialized !== lastSerialized.current) {
            lastSerialized.current = serialized
            setCurrentNavigation(event.data.navigation)
          }
        } else {
          refresh()
        }
      }
    } catch {}

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      channel?.close()
    }
  }, [pathname, refresh])

  if (pathname.startsWith('/admin')) return null
  return <StoreNav theme={theme} navigation={currentNavigation} />
}

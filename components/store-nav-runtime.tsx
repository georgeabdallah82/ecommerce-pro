'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { StoreNav } from './store-nav'

export default function StoreNavRuntime({ theme, navigation }: { theme: any; navigation: any[] }) {
  const pathname = usePathname() || '/'
  const [currentNavigation, setCurrentNavigation] = useState(navigation || [])
  const lastSerialized = useRef(JSON.stringify(navigation || []))

  useEffect(() => {
    let alive = true
    const apply = (next: any[]) => {
      const serialized = JSON.stringify(next || [])
      if (serialized === lastSerialized.current) return
      lastSerialized.current = serialized
      if (alive) setCurrentNavigation(next || [])
    }

    const load = async () => {
      try {
        const res = await fetch('/api/navigation', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.navigation)) apply(data.navigation)
      } catch {}
    }

    load()
    const timer = window.setInterval(load, 3000)
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('store-navigation')
      channel.onmessage = event => {
        if (Array.isArray(event.data?.navigation)) apply(event.data.navigation)
        else load()
      }
    } catch {}

    return () => {
      alive = false
      window.clearInterval(timer)
      channel?.close()
    }
  }, [])

  if (pathname.startsWith('/admin')) return null
  return <StoreNav theme={theme} navigation={currentNavigation} />
}

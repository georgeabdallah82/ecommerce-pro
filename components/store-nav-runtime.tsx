'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import StoreNavFixed from './store-nav-fixed'

export default function StoreNavRuntime({ theme, navigation }: { theme: any; navigation: any[] }) {
  const pathname = usePathname() || '/'
  const [currentTheme, setCurrentTheme] = useState(theme)
  const [currentNavigation, setCurrentNavigation] = useState(navigation || [])

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    let themeChannel: BroadcastChannel | null = null
    let navigationChannel: BroadcastChannel | null = null

    try {
      themeChannel = new BroadcastChannel('store-theme')
      themeChannel.onmessage = event => {
        if (event.data?.theme) setCurrentTheme(event.data.theme)
      }
    } catch {}

    try {
      navigationChannel = new BroadcastChannel('store-navigation')
      navigationChannel.onmessage = event => {
        if (Array.isArray(event.data?.navigation)) setCurrentNavigation(event.data.navigation)
      }
    } catch {}

    return () => {
      themeChannel?.close()
      navigationChannel?.close()
    }
  }, [pathname])

  if (pathname.startsWith('/admin')) return null
  return <StoreNavFixed theme={currentTheme} navigation={currentNavigation} />
}

'use client'

import { useEffect, useRef, useState } from 'react'
import StorefrontSections from '@/components/storefront-sections'

type Props = React.ComponentProps<typeof StorefrontSections>

export default function LiveStorefrontSections(props: Props) {
  const [theme, setTheme] = useState(props.theme)
  const [sections, setSections] = useState(props.sections)
  const signature = useRef(JSON.stringify({ theme: props.theme, sections: props.sections }))

  useEffect(() => {
    let alive = true
    const apply = (nextTheme: any, nextSections: any[]) => {
      const nextSignature = JSON.stringify({ theme: nextTheme, sections: nextSections })
      if (nextSignature === signature.current) return
      signature.current = nextSignature
      if (alive) {
        setTheme(nextTheme)
        setSections(nextSections)
      }
    }

    const load = async () => {
      try {
        const response = await fetch('/api/storefront/theme', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (data?.theme && Array.isArray(data?.sections)) apply(data.theme, data.sections)
      } catch {}
    }

    const refreshOnFocus = () => { void load() }
    void load()
    const timer = window.setInterval(load, 3000)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('store-theme')
      channel.onmessage = event => {
        const data = event.data
        if (data?.theme && Array.isArray(data.sections)) apply(data.theme, data.sections)
        else void load()
      }
    } catch {}

    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      channel?.close()
    }
  }, [])

  return <StorefrontSections {...props} theme={theme} sections={sections} />
}

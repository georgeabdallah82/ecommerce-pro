'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import StorefrontSections from '@/components/storefront-sections'

type Props = React.ComponentProps<typeof StorefrontSections>

function templateKey(pathname: string) {
  if (pathname === '/') return 'Home page'
  if (pathname.startsWith('/shop')) return 'Products'
  if (pathname.startsWith('/product/')) return 'Product'
  if (pathname === '/collections') return 'Collections'
  if (pathname.startsWith('/collections/')) return 'Collection'
  if (pathname.startsWith('/cart')) return 'Cart'
  if (pathname.startsWith('/blog')) return 'Blog'
  return 'Pages'
}

export default function LiveStorefrontSections(props: Props) {
  const pathname = usePathname() || '/'
  const key = useMemo(() => templateKey(pathname), [pathname])
  const initialSections = (props.theme?.editorTemplates?.[key]?.length ? props.theme.editorTemplates[key] : props.sections) || []
  const [theme, setTheme] = useState(props.theme)
  const [sections, setSections] = useState(initialSections)
  const signature = useRef(JSON.stringify({ theme: props.theme, sections: initialSections, key }))

  useEffect(() => {
    let alive = true
    const apply = (nextTheme: any, nextSections: any[]) => {
      const nextSignature = JSON.stringify({ theme: nextTheme, sections: nextSections, key })
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
        if (!data?.theme) return
        const nextTemplates = data.theme.editorTemplates?.[key]
        const nextSections = Array.isArray(nextTemplates) && nextTemplates.length ? nextTemplates : (Array.isArray(data.sections) ? data.sections : [])
        apply(data.theme, nextSections)
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
      channel.onmessage = () => { void load() }
    } catch {}

    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibilityChange)
      channel?.close()
    }
  }, [key])

  return <StorefrontSections {...props} theme={theme} sections={sections} />
}

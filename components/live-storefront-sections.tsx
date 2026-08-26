'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import StorefrontSections from '@/components/storefront-sections'

type Props = React.ComponentProps<typeof StorefrontSections>
const REFRESH_MS = 30000

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
  const hasSavedTemplate = Object.prototype.hasOwnProperty.call(props.theme?.editorTemplates || {}, key)
  const initialTemplate = props.theme?.editorTemplates?.[key]
  const initialSections = hasSavedTemplate ? (Array.isArray(initialTemplate) ? initialTemplate : []) : (props.sections || [])
  const [theme, setTheme] = useState(props.theme)
  const [sections, setSections] = useState(initialSections)
  const signature = useRef(JSON.stringify({ theme: props.theme, sections: initialSections, key }))
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    const apply = (nextTheme: any, nextSections: any[]) => {
      const nextSignature = JSON.stringify({ theme: nextTheme, sections: nextSections, key })
      if (nextSignature === signature.current) return
      signature.current = nextSignature
      if (alive) { setTheme(nextTheme); setSections(nextSections) }
    }

    const load = async () => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const response = await fetch('/api/storefront/theme', { cache: 'no-store', signal: controller.signal })
        if (!response.ok || controller.signal.aborted) return
        const data = await response.json()
        if (!data?.theme || controller.signal.aborted) return
        const templates = data.theme.editorTemplates || {}
        const hasTemplate = Object.prototype.hasOwnProperty.call(templates, key)
        const template = templates[key]
        const nextSections = hasTemplate ? (Array.isArray(template) ? template : []) : (Array.isArray(data.sections) ? data.sections : [])
        apply(data.theme, nextSections)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      } finally {
        if (inFlight.current === controller) inFlight.current = null
      }
    }

    const refreshOnFocus = () => { void load() }
    void load()
    const timer = window.setInterval(load, REFRESH_MS)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    let channel: BroadcastChannel | null = null
    try { channel = new BroadcastChannel('store-theme'); channel.onmessage = () => { void load() } } catch {}

    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      channel?.close()
      inFlight.current?.abort()
    }
  }, [key])

  return <StorefrontSections {...props} theme={theme} sections={sections} />
}

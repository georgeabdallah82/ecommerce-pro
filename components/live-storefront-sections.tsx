'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const hasSavedTemplate = Object.prototype.hasOwnProperty.call(props.theme?.editorTemplates || {}, key)
  const initialTemplate = props.theme?.editorTemplates?.[key]
  const initialSections = hasSavedTemplate ? (Array.isArray(initialTemplate) ? initialTemplate : []) : (props.sections || [])
  const [theme, setTheme] = useState(props.theme)
  const [sections, setSections] = useState(initialSections)

  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('store-theme')
      channel.onmessage = event => {
        const nextTheme = event.data?.theme
        if (!nextTheme) return
        const templates = nextTheme.editorTemplates || {}
        const hasTemplate = Object.prototype.hasOwnProperty.call(templates, key)
        const template = templates[key]
        const nextSections = hasTemplate ? (Array.isArray(template) ? template : []) : initialSections
        setTheme(nextTheme)
        setSections(nextSections)
      }
    } catch {}

    return () => channel?.close()
  }, [key, initialSections])

  return <StorefrontSections {...props} theme={theme} sections={sections} />
}

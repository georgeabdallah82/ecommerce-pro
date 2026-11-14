'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import { confirmLeave, hasUnsavedChanges } from './use-leave-guard'

type Href = ComponentProps<typeof Link>['href']

// The address an href object stands for (pathname, query, hash), as Link writes it.
function hrefString(href: Href): string {
  if (typeof href === 'string') return href
  const query = href.query && typeof href.query === 'object'
    ? new URLSearchParams(Object.entries(href.query).flatMap(([key, value]) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(item => [key, String(item)]))).toString()
    : String(href.query || '')
  const search = href.search || (query ? `?${query}` : '')
  const hash = href.hash ? (href.hash.startsWith('#') ? href.hash : `#${href.hash}`) : ''
  return `${href.pathname || ''}${search}${hash}`
}

// Links inside the admin. Next.js prefetches every link it sees on screen; in the admin that
// was about 48 background requests per page view (each menu item asked twice), and each one
// read the store settings from the database again, because signed-in staff skip the shared
// settings cache to see their own changes at once. Admin pages are always rendered fresh on
// click anyway, so the admin's links load when they are clicked; the bar at the top of the
// page (components/nav-progress.tsx) shows the click straight away.
// With unsaved changes on the page (components/use-leave-guard.ts), a link to another page asks first, and goes only
// if the person chooses to leave; links within the same page (#section) don't ask.
export default function AdminLink({ prefetch = false, onNavigate, ...props }: ComponentProps<typeof Link>) {
  const router = useRouter()
  return <Link prefetch={prefetch} {...props} onNavigate={event => {
    let held = false
    onNavigate?.({ preventDefault: () => { held = true; event.preventDefault() } })
    if (held || !hasUnsavedChanges()) return
    const href = hrefString(props.href)
    const target = new URL(href, window.location.href)
    if (target.pathname === window.location.pathname && target.search === window.location.search) return
    event.preventDefault()
    // The loading bar (components/nav-progress.tsx) started on the click: nothing loads while the question is open.
    window.dispatchEvent(new Event('admin:navigation-held'))
    void confirmLeave().then(ok => {
      if (!ok) return
      if (props.replace) router.replace(href, { scroll: props.scroll ?? true })
      else router.push(href, { scroll: props.scroll ?? true })
    })
  }} />
}

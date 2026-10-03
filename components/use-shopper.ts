'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Who is signed in, for the storefront header and menu. Store pages are cached and shared by
// every visitor, so the name can't be part of the page: it's asked for from the browser. Asked
// again when the shopper leaves or enters the account/checkout pages (signing in or out happens
// there; sign-in redirects without a full reload) and when they come back to the tab.
export type Shopper = { name: string; firstName: string; initial: string } | null

let pending: Promise<Shopper> | null = null
function fetchShopper(force = false): Promise<Shopper> {
  if (!pending || force) {
    pending = fetch('/api/auth/session', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const u = data?.authenticated ? data.user : null
        if (!u) return null
        const name = String(u.name || '').trim() || String(u.email || '').split('@')[0] || 'My account'
        const firstName = name.split(/\s+/)[0]
        return { name, firstName, initial: firstName.charAt(0).toUpperCase() }
      })
      .catch(() => null)
  }
  return pending
}

const accountArea = (path: string) => path.startsWith('/account') || path.startsWith('/checkout')

export function useShopper(): Shopper {
  const pathname = usePathname() || '/'
  const [shopper, setShopper] = useState<Shopper>(null)
  const last = useRef<string | null>(null)

  useEffect(() => {
    const prev = last.current
    last.current = pathname
    const force = prev !== null && (accountArea(prev) || accountArea(pathname))
    let active = true
    fetchShopper(force).then(s => { if (active) setShopper(s) })
    return () => { active = false }
  }, [pathname])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') fetchShopper(true).then(setShopper) }
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  return shopper
}

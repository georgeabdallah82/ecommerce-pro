'use client'

import { useEffect, useRef } from 'react'
import { trackSearch } from '@/lib/tracking-events'

// Ads: reports a store search to the pixels when the shop shows search results.
export function SearchTracker({ query }: { query: string }) {
  const tracked = useRef<string | null>(null)
  useEffect(() => {
    if (tracked.current === query) return
    tracked.current = query
    trackSearch(query)
  }, [query])
  return null
}

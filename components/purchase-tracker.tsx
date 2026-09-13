'use client'

import { useEffect } from 'react'
import { trackPurchase } from '@/lib/tracking-events'
import type { TrackedLineItem } from '@/lib/tracking-events'

export function PurchaseTracker({ orderNumber, value, currency, items }: { orderNumber: string; value: number; currency: string; items: TrackedLineItem[] }) {
  useEffect(() => {
    const key = `tracked-purchase:${orderNumber}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {}
    trackPurchase({ orderNumber, value, currency, items })
  }, [orderNumber, value, currency, items])

  return null
}

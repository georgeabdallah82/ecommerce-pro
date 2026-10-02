'use client'

import { useEffect } from 'react'
import { trackPurchase } from '@/lib/tracking-events'
import type { TrackedLineItem } from '@/lib/tracking-events'

export function PurchaseTracker({ orderNumber, value, currency, items }: { orderNumber: string; value: number; currency: string; items: TrackedLineItem[] }) {
  useEffect(() => {
    // localStorage, not sessionStorage: reopening the thank-you page in a new tab used to
    // report the sale again. Meta/TikTok also dedupe on the order-number event ID and GA on
    // transaction_id, so this is the first of two guards.
    const key = `tracked-purchase:${orderNumber}`
    try {
      if (localStorage.getItem(key) || sessionStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {}
    trackPurchase({ orderNumber, value, currency, items })
  }, [orderNumber, value, currency, items])

  return null
}

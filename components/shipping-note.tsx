'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// Default "Shipping & returns" text on product pages when the merchant hasn't written their
// own. Built from the real free-delivery threshold (Settings > Checkout) so it can never
// promise a different amount than checkout charges.
export function ShippingNote() {
  const [free, setFree] = useState('')
  useEffect(() => {
    let active = true
    fetch('/api/store/settings')
      .then(res => res.json())
      .then(data => {
        const threshold = Number(data?.settings?.checkout?.freeShippingThreshold)
        const currency = data?.settings?.store?.currency || 'USD'
        if (!active || !Number.isFinite(threshold) || threshold <= 0) return
        try { setFree(new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(threshold)) } catch { setFree(`${threshold} ${currency}`) }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  return <>
    {free && <>Free delivery on orders over {free}. </>}
    The delivery fee and estimated delivery time are shown at checkout. See our <Link href="/refund-policy">Refund Policy</Link> for returns.
  </>
}

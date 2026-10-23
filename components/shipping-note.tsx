'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/lang-provider'
import { loadStoreSettings } from '@/lib/store-settings-client'

// The old built-in default. Themes saved before it was replaced still store it word for word,
// and it promised $50 free delivery and worldwide shipping whatever the store's settings,
// so it counts as "not set".
const LEGACY_DEFAULT = 'Free standard delivery is automatically applied to orders over $50. Tracked shipping worldwide.'
export function merchantShippingText(value: unknown): string {
  const text = String(value ?? '').trim()
  return text === LEGACY_DEFAULT ? '' : text
}

// The store's free-delivery amount, formatted ("$100"), or '' when there isn't one. Read
// from Settings > Checkout so no label can promise a different amount than checkout charges.
export function useFreeDeliveryAmount() {
  const [free, setFree] = useState('')
  useEffect(() => {
    let active = true
    loadStoreSettings()
      .then(data => {
        const threshold = Number(data?.settings?.checkout?.freeShippingThreshold)
        const currency = data?.settings?.store?.currency || 'USD'
        if (!active || !Number.isFinite(threshold) || threshold <= 0) return
        try { setFree(new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(threshold)) } catch { setFree(`${threshold} ${currency}`) }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  return free
}

// Product page trust badge.
export function FreeDeliveryBadge() {
  const free = useFreeDeliveryAmount()
  const { t } = useI18n()
  return <span>✓ {free ? t('Free delivery over {amount}', { amount: free }) : t('Cash on delivery')}</span>
}

// Default "Shipping & returns" text on product pages when the merchant hasn't written their
// own. Built from the real free-delivery threshold (Settings > Checkout).
export function ShippingNote() {
  const free = useFreeDeliveryAmount()
  const { t } = useI18n()
  return <>
    {free && <>{t('Free delivery on orders over {amount}.', { amount: free })} </>}
    {t('The delivery fee and estimated delivery time are shown at checkout.')} <Link href="/refund-policy" className="aliTapLink">{t('Delivery & refund policy')}</Link>
  </>
}

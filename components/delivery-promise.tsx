'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banknote, RotateCcw, Truck } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { loadStoreSettings } from '@/lib/store-settings-client'
import { money } from '@/components/storefront-sections'

type Rate = { price: number; freeAbove?: number | null }

// One quote per area per page load: the product page asks again only when the shopper picks
// another area in the delivery bar.
const quotes = new Map<string, Promise<Rate | null>>()
function cheapestRate(country: string, area: string): Promise<Rate | null> {
  const key = `${country}|${area}`
  if (!quotes.has(key)) {
    quotes.set(key, fetch(`/api/checkout/shipping-rates?country=${encodeURIComponent(country)}&region=${encodeURIComponent(area)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const rates: Rate[] = Array.isArray(data?.rates) ? data.rates : []
        return rates.length ? rates.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a)) : null
      })
      .catch(() => { quotes.delete(key); return null }))
  }
  return quotes.get(key)!
}

// The product page's answer to "what will delivery cost, how do I pay, can I send it back",
// under the buy buttons. Every line comes from the store's own settings: the delivery rate the
// checkout will charge for the chosen area, the free-delivery amount, the payment methods that
// are switched on and the product's returns setting. Nothing shows that the store didn't set.
export default function DeliveryPromise({ area, eta, orderValue, currency, returnsEnabled }: { area?: string; eta?: string; orderValue: number; currency: string; returnsEnabled: boolean }) {
  const { t } = useI18n()
  const [settings, setSettings] = useState<any>(null)
  const [rate, setRate] = useState<Rate | null>(null)
  useEffect(() => { let on = true; loadStoreSettings().then(data => { if (on) setSettings(data?.settings || null) }); return () => { on = false } }, [])
  const country = settings?.store?.country || ''
  useEffect(() => {
    if (!country) return
    let on = true
    cheapestRate(country, area || '').then(r => { if (on) setRate(r) })
    return () => { on = false }
  }, [country, area])

  const pay = settings?.payment || {}
  const others = [pay.bank && (pay.details?.bank?.label || t('Bank transfer')), pay.card && t('Card')].filter(Boolean) as string[]
  const threshold = Number(settings?.checkout?.freeShippingThreshold)
  const freeAbove = Number(rate?.freeAbove) > 0 ? Number(rate?.freeAbove) : Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold * 100) : 0

  let fee = ''
  if (rate) {
    if (Number(rate.price) <= 0 || (freeAbove > 0 && orderValue >= freeAbove)) fee = t('Free delivery on this order')
    else fee = [money(Number(rate.price), currency), freeAbove > 0 ? t('free over {amount}', { amount: money(freeAbove, currency) }) : ''].filter(Boolean).join(' · ')
  } else if (freeAbove > 0) fee = t('Free delivery over {amount}', { amount: money(freeAbove, currency) })
  const deliveryDetail = [fee, eta].filter(Boolean).join(' · ')

  if (!settings && !eta) return null
  return (
    <ul className="pdpPromise" aria-label={t('Delivery and payment')}>
      {(deliveryDetail || area) && (
        <li>
          <Truck size={18} aria-hidden="true" />
          <span><b>{area ? t('Delivery to {area}', { area }) : t('Delivery')}</b>{deliveryDetail && <small>{deliveryDetail}</small>}</span>
        </li>
      )}
      {(pay.cod || others.length > 0) && (
        <li>
          <Banknote size={18} aria-hidden="true" />
          <span><b>{pay.cod ? t('Cash on delivery') : t('Payment')}</b><small>{[pay.cod && t('Pay when it arrives'), others.length > 0 && (pay.cod ? t('Also: {methods}', { methods: others.join(', ') }) : others.join(', '))].filter(Boolean).join(' · ')}</small></span>
        </li>
      )}
      {returnsEnabled && (
        <li>
          <RotateCcw size={18} aria-hidden="true" />
          <span><b>{t('Easy returns')}</b><small><Link href="/refund-policy">{t('Read the returns policy')}</Link></small></span>
        </li>
      )}
    </ul>
  )
}

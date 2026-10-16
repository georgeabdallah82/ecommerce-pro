'use client'

import { useEffect, useState } from 'react'
import { Gift, Zap } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { loadStoreSettings } from '@/lib/store-settings-client'
import { formatLbp, freeGiftProgress, lbpAmount } from '@/lib/selling'
import { countdown, type FlashSale } from '@/lib/flash-sale-shared'
import { money } from '@/lib/config'

export type ClientSelling = {
  lbp: { show: boolean; rate: number }
  freeGift: { threshold: number; productId: string; name: string; slug: string; image: string } | null
  giftOption: boolean
  welcome: { enabled: boolean; code: string; title: string; delaySeconds: number }
  flashSales: FlashSale[]
}

// The selling tools' public settings (/api/store/settings), shared by everything on the page.
export function useSelling() {
  const [selling, setSelling] = useState<ClientSelling | null>(null)
  useEffect(() => {
    let active = true
    loadStoreSettings().then(data => { if (active) setSelling(data?.settings?.selling || null) }).catch(() => {})
    return () => { active = false }
  }, [])
  return selling
}

// "≈ 895,000 LBP" under a dollar amount, when the store shows Lebanese pounds (Settings > Markets).
export function LbpNote({ cents, rate, className }: { cents: number; rate?: number; className?: string }) {
  const selling = useSelling()
  const r = rate ?? (selling?.lbp.show ? selling.lbp.rate : 0)
  if (!r || !cents) return null
  return <span className={className || 'lbpNote'} dir="ltr">{'\u2248'} {formatLbp(lbpAmount(cents, r))}</span>
}

// A ticking "ends in 02:14:09" for flash sales. Renders nothing on the server, so the first
// paint never shows a time that is already wrong.
export function FlashCountdown({ endsAt, compact = false }: { endsAt: string; compact?: boolean }) {
  const { t } = useI18n()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (now === null || new Date(endsAt).getTime() <= now) return null
  const left = countdown(endsAt, now)
  return compact
    ? <span className="flashBadge" dir="ltr"><Zap size={12} aria-hidden="true" /> {left}</span>
    : <span className="flashCountdown"><Zap size={15} aria-hidden="true" /> {t('Flash sale ends in')} <strong dir="ltr">{left}</strong></span>
}

// Cart: how far the shopper is from the free gift (Settings > Selling tools).
export function FreeGiftBar({ subtotal, currency }: { subtotal: number; currency: string }) {
  const { t } = useI18n()
  const selling = useSelling()
  const gift = selling?.freeGift
  if (!gift || !subtotal) return null
  const progress = freeGiftProgress(subtotal, gift.threshold)
  return <div className={`freeGiftBar${progress.reached ? ' reached' : ''}`} role="status">
    <Gift size={18} aria-hidden="true" />
    <div>
      <p>{progress.reached
        ? t('You get a free {gift} with this order!', { gift: gift.name })
        : t('Add {amount} more to get a free {gift}.', { amount: money(progress.remaining, currency), gift: gift.name })}</p>
      <span className="freeGiftTrack" aria-hidden="true"><span style={{ width: `${progress.percent}%` }} /></span>
    </div>
  </div>
}

// Home page strip while a flash sale runs (Admin > Discounts > Flash sale).
export function FlashSaleBanner() {
  const { t } = useI18n()
  const selling = useSelling()
  const sales = (selling?.flashSales || []).filter(s => new Date(s.endsAt).getTime() > Date.now())
  if (!sales.length) return null
  const best = Math.max(...sales.map(s => s.percent))
  const endsAt = sales.map(s => s.endsAt).sort()[0]
  return <a className="flashStrip" href="/shop?sale=flash">
    <span className="flashStripTitle"><Zap size={18} aria-hidden="true" /> {t('Flash sale: up to {percent}% off', { percent: best })}</span>
    <FlashCountdown endsAt={endsAt} compact />
    <span className="flashStripCta">{t('Shop the sale')}</span>
  </a>
}

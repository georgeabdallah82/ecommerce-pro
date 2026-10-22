'use client'

import { useEffect, useState } from 'react'
import { CalendarHeart, Gift, Layers, Zap } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { loadStoreSettings } from '@/lib/store-settings-client'
import { formatLbp, freeGiftProgress, lbpAmount } from '@/lib/selling'
import { countdown, type FlashSale } from '@/lib/flash-sale-shared'
import { money } from '@/lib/config'
import { bestDeal, nextOffer, type PublicDeal, type QuantityTier } from '@/lib/quantity-deals-shared'
import { activeOccasion, dayKeyOf, type Occasion } from '@/lib/occasions'

export type ClientSelling = {
  lbp: { show: boolean; rate: number }
  freeGift: { threshold: number; productId: string; name: string; slug: string; image: string } | null
  giftOption: boolean
  welcome: { enabled: boolean; code: string; title: string; delaySeconds: number }
  flashSales: FlashSale[]
  quantityDeals?: PublicDeal[]
  occasions?: Occasion[]
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

// Marketing > Occasions: the occasion to show today, by the shopper's own day. Nothing on the
// server, so a page never shows a day that has already passed for the shopper.
function useOccasion() {
  const selling = useSelling()
  const [today, setToday] = useState('')
  useEffect(() => { setToday(dayKeyOf(new Date())) }, [])
  if (!today || !selling?.occasions?.length) return null
  const occasion = activeOccasion(selling.occasions, today)
  return occasion ? { occasion, lastDay: occasion.orderBy === today } : null
}

function useOccasionText() {
  const { t, lang } = useI18n()
  const shown = useOccasion()
  if (!shown) return null
  const { occasion, lastDay } = shown
  const name = lang === 'ar' && occasion.nameAr ? occasion.nameAr : occasion.name
  const day = (key: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
  return {
    occasion, name,
    title: lastDay ? t('Last day to order for {occasion}: today!', { occasion: name }) : t('Order by {date} to receive it for {occasion}.', { date: day(occasion.orderBy), occasion: name }),
    when: t('{occasion} is on {date}.', { occasion: name, date: day(occasion.date) }),
    cta: t('Shop gifts'),
  }
}

// Home page strip while an occasion is on.
export function OccasionBanner() {
  const shown = useOccasionText()
  if (!shown) return null
  const body = <>
    <span className="occasionStripTitle"><CalendarHeart size={18} aria-hidden="true" /> {shown.title}</span>
    <span className="occasionStripWhen">{shown.when}</span>
    {shown.occasion.link && <span className="occasionStripCta">{shown.cta}</span>}
  </>
  return shown.occasion.link ? <a className="occasionStrip" href={shown.occasion.link}>{body}</a> : <div className="occasionStrip">{body}</div>
}

// One line on product pages and in the cart.
export function OccasionNote() {
  const shown = useOccasionText()
  if (!shown) return null
  return <p className="occasionNote"><CalendarHeart size={15} aria-hidden="true" /> {shown.title}</p>
}

// "Buy 2, save 10%" / "3 for $20.00": one offer of a quantity deal, in the shopper's language.
function useOfferText() {
  const { t } = useI18n()
  return (tier: QuantityTier) => tier.kind === 'percent'
    ? t('Buy {quantity}, save {percent}%', { quantity: tier.quantity, percent: tier.value })
    : t('{quantity} for {price}', { quantity: tier.quantity, price: money(tier.value) })
}

// Product page: the offers that cover this product (Marketing > Quantity deals). The deals come
// from the server with the page, so nothing jumps in after it loads.
export function QuantityDealsBox({ deals }: { deals: PublicDeal[] }) {
  const { t } = useI18n()
  const offerText = useOfferText()
  const seen = new Set<string>()
  const tiers = deals.flatMap(d => d.tiers).filter(tier => { const key = `${tier.quantity}:${tier.kind}:${tier.value}`; if (seen.has(key)) return false; seen.add(key); return true }).sort((a, b) => a.quantity - b.quantity)
  if (!tiers.length) return null
  return <div className="qtyDealBox" role="group" aria-label={t('Buy more, save more')}>
    <strong><Layers size={16} aria-hidden="true" /> {t('Buy more, save more')}</strong>
    <ul>{tiers.map(tier => <li key={`${tier.quantity}:${tier.kind}:${tier.value}`}>{offerText(tier)}</li>)}</ul>
  </div>
}

// Cart: how close the shopper is to the next offer, or what they already save. The price itself
// is worked out at checkout from the same rules (lib/checkout-discounts.ts).
export function QuantityDealBar({ items }: { items: Array<{ productId: string; quantity: number; price: number }> }) {
  const { t } = useI18n()
  const selling = useSelling()
  const deals = selling?.quantityDeals || []
  if (!deals.length || !items.length) return null
  const lines = items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.price, totalPrice: i.price * i.quantity, taxable: true }))
  const saving = bestDeal({ enabled: true, deals: deals.map(d => ({ ...d, name: '', active: true })) }, lines)
  const next = nextOffer(deals, items)
  if (!saving && !next) return null
  return <div className={`freeGiftBar${saving && !next ? ' reached' : ''}`} role="status">
    <Layers size={18} aria-hidden="true" />
    <div>
      {saving && <p>{t('You save {amount} with a quantity deal. It is taken off at checkout.', { amount: money(saving.split.total) })}</p>}
      {next && <p>{next.tier.kind === 'percent'
        ? t('Add {count} more to save {percent}% on these items.', { count: next.more, percent: next.tier.value })
        : t('Add {count} more to get {quantity} for {price}.', { count: next.more, quantity: next.tier.quantity, price: money(next.tier.value) })}</p>}
    </div>
  </div>
}

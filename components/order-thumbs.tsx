'use client'

import { Package } from 'lucide-react'
import { StoreImage } from '@/components/storefront-sections'

// Up to three product photos at the start of an order row (app/account/orders/page.tsx), so a past order is
// recognised at a glance. Decorative: the order's number, date, item count and total are written beside them.
// A product without a photo gets a plain parcel tile, never the stock placeholder.
export default function OrderThumbs({ photos }: { photos: (string | null)[] }) {
  return (
    <span className="orderThumbs" aria-hidden="true">
      {photos.slice(0, 3).map((src, i) => src
        ? <StoreImage key={i} src={src} alt="" />
        : <span key={i} className="orderThumbBlank"><Package size={18} strokeWidth={1.6} /></span>)}
    </span>
  )
}

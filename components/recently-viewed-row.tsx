'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/lang-provider'
import { ProductCard } from '@/components/storefront-sections'

type AnyMap = Record<string, any>
const KEY = 'ecom-recent-products-v1'

// "Recently viewed" under a product (this browser only): the other products the shopper looked
// at, newest first. The same list the home page's Recently viewed section reads.
export default function RecentlyViewedRow({ currentId, theme, onQuickView, wishlist, toggleWish }: { currentId: string; theme: AnyMap; onQuickView: (p: AnyMap) => void; wishlist?: Record<string, boolean>; toggleWish?: (id: string) => void }) {
  const { t } = useI18n()
  const [items, setItems] = useState<AnyMap[]>([])
  useEffect(() => {
    let ids: string[] = []
    try { const raw = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(raw)) ids = raw.map(String).filter(id => id !== currentId).slice(0, 8) } catch {}
    if (ids.length < 2) { setItems([]); return }
    let active = true
    fetch(`/api/products?ids=${ids.map(encodeURIComponent).join(',')}`)
      .then(r => (r.ok ? r.json() : []))
      .then(list => { if (active && Array.isArray(list)) setItems(list) })
      .catch(() => {})
    return () => { active = false }
  }, [currentId])
  if (items.length < 2) return null
  return <div className="aliContainer aliSection">
    <div className="aliSectionHead"><h2>{t('Recently viewed')}</h2></div>
    <div className="aliDenseGrid">
      {items.map(p => <ProductCard key={p.id} p={p} theme={theme} onQuickView={onQuickView} wishlist={wishlist} toggleWish={toggleWish} />)}
    </div>
  </div>
}

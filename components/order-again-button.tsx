'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { useCart, type CartItem } from '@/components/cart-provider'
import { useI18n } from '@/components/lang-provider'

// "Order again": puts the past order's products (today's prices, what's in stock) in the cart.
export default function OrderAgainButton({ items }: { items: CartItem[] }) {
  const { addItem } = useCart()
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return <button type="button" className="btn" disabled={busy || !items.length} onClick={() => {
    setBusy(true)
    for (const item of items) addItem(item, false, false)
    router.push('/cart')
  }}><RotateCcw size={16} aria-hidden="true" /> {t('Order again')}</button>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { useCart, type CartItem } from '@/components/cart-provider'
import { useI18n } from '@/components/lang-provider'

// "Running low?" (app/refill/[orderNumber]): puts the products back in the cart, at today's prices, in one tap.
export default function RefillButton({ items, className }: { items: CartItem[]; className?: string }) {
  const { addItem } = useCart()
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return <button type="button" className={className} style={{ gap: 8 }} disabled={busy || !items.length} onClick={() => {
    setBusy(true)
    for (const item of items) addItem(item, false, false)
    router.push('/cart')
  }}><ShoppingCart size={18} aria-hidden="true" /> {t('Add to cart')}</button>
}

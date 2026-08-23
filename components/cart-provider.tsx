'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type CartItem = {
  productId: string
  variantId?: string | null
  name: string
  sku: string
  price: number
  image?: string
  quantity: number
}

type CartContextValue = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  updateQty: (key: string, qty: number) => void
  removeItem: (key: string) => void
  clear: () => void
  count: number
  subtotal: number
}

const CartContext = createContext<CartContextValue | null>(null)
const MAX_QTY = 99
const keyOf = (i: Pick<CartItem, 'productId' | 'variantId'>) => `${i.productId}:${i.variantId || 'default'}`

function sanitizeItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      productId: String(item.productId || '').trim(),
      variantId: item.variantId ? String(item.variantId) : null,
      name: String(item.name || 'Product').slice(0, 300),
      sku: String(item.sku || '').slice(0, 120),
      price: Math.max(0, Number.isFinite(Number(item.price)) ? Number(item.price) : 0),
      image: item.image ? String(item.image).slice(0, 2000) : undefined,
      quantity: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(item.quantity) || 1))),
    }))
    .filter(item => item.productId && item.sku)
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ecom-cart-v1')
      if (raw) setItems(sanitizeItems(JSON.parse(raw)))
    } catch {
      localStorage.removeItem('ecom-cart-v1')
      setItems([])
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (ready) localStorage.setItem('ecom-cart-v1', JSON.stringify(items))
  }, [items, ready])

  const value = useMemo<CartContextValue>(() => ({
    items,
    addItem: (item: CartItem) => setItems(prev => {
      const safe: CartItem = {
        ...item,
        productId: String(item.productId).trim(),
        variantId: item.variantId || null,
        name: String(item.name || 'Product').slice(0, 300),
        sku: String(item.sku || '').slice(0, 120),
        price: Math.max(0, Number.isFinite(Number(item.price)) ? Number(item.price) : 0),
        quantity: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(item.quantity) || 1))),
      }
      if (!safe.productId || !safe.sku) return prev
      const key = keyOf(safe)
      const found = prev.find(x => keyOf(x) === key)
      if (found) return prev.map(x => keyOf(x) === key ? { ...x, quantity: Math.min(MAX_QTY, x.quantity + safe.quantity) } : x)
      return [...prev, safe]
    }),
    updateQty: (key, qty) => setItems(prev => {
      const next = Math.floor(Number(qty) || 0)
      return next <= 0
        ? prev.filter(x => keyOf(x) !== key)
        : prev.map(x => keyOf(x) === key ? { ...x, quantity: Math.min(MAX_QTY, Math.max(1, next)) } : x)
    }),
    removeItem: key => setItems(prev => prev.filter(x => keyOf(x) !== key)),
    clear: () => setItems([]),
    count: items.reduce((a, b) => a + b.quantity, 0),
    subtotal: items.reduce((a, b) => a + b.price * b.quantity, 0),
  }), [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const c = useContext(CartContext)
  if (!c) throw new Error('useCart must be used within CartProvider')
  return c
}

export { keyOf }

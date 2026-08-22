'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type CartItem = { productId:string; variantId?:string|null; name:string; sku:string; price:number; image?:string; quantity:number }
type CartContextValue = { items:CartItem[]; addItem:(item:CartItem)=>void; updateQty:(key:string,qty:number)=>void; removeItem:(key:string)=>void; clear:()=>void; count:number; subtotal:number }
const CartContext = createContext<CartContextValue | null>(null)
const keyOf = (i:Pick<CartItem,'productId'|'variantId'>) => `${i.productId}:${i.variantId||'default'}`

export function CartProvider({children}:{children:React.ReactNode}) {
  const [items,setItems] = useState<CartItem[]>([])
  const [ready,setReady] = useState(false)
  useEffect(()=>{ try{ const raw=localStorage.getItem('ecom-cart-v1'); if(raw)setItems(JSON.parse(raw)) } finally { setReady(true) } },[])
  useEffect(()=>{ if(ready)localStorage.setItem('ecom-cart-v1',JSON.stringify(items)) },[items,ready])
  const value = useMemo(()=>({
    items,
    addItem:(item:CartItem)=>setItems(prev=>{const key=keyOf(item);const found=prev.find(x=>keyOf(x)===key);if(found)return prev.map(x=>keyOf(x)===key?{...x,quantity:Math.min(99,x.quantity+item.quantity)}:x);return [...prev,item]}),
    updateQty:(key:string,qty:number)=>setItems(prev=>qty<=0?prev.filter(x=>keyOf(x)!==key):prev.map(x=>keyOf(x)===key?{...x,quantity:Math.min(99,Math.max(1,qty))}:x)),
    removeItem:(key:string)=>setItems(prev=>prev.filter(x=>keyOf(x)!==key)),
    clear:()=>setItems([]),
    count:items.reduce((a,b)=>a+b.quantity,0),
    subtotal:items.reduce((a,b)=>a+b.price*b.quantity,0),
  }),[items])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart(){const c=useContext(CartContext);if(!c)throw new Error('useCart must be used within CartProvider');return c}
export { keyOf }

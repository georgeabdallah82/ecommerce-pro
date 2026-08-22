'use client'
import { useCart } from './cart-provider'
import { ShoppingBag } from 'lucide-react'
export function AddToCart({item,disabled=false}:{item:{productId:string;variantId?:string|null;name:string;sku:string;price:number;image?:string};disabled?:boolean}){
 const {addItem}=useCart()
 return <button className="btn" type="button" disabled={disabled} onClick={()=>addItem({...item,quantity:1})}><ShoppingBag size={17}/> Add to cart</button>
}

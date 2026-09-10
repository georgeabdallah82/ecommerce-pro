'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { money } from '@/lib/config'
import s from './admin-order-detail.module.css'
import ui from './admin-ui.module.css'

type Product = { id:string; name:string; sku:string; basePrice:number; images?:{url:string}[]; variants?:{id:string;name:string;sku:string;price:number|null}[] }
type Customer = { id:string; name:string; email:string; phone?:string|null }
type Line = { productId:string; variantId:string|null; name:string; sku:string; quantity:number; price:number }

export default function ManualOrderForm({ products, customers }:{ products:Product[]; customers:Customer[] }) {
  const router = useRouter()
  const [customerId,setCustomerId]=useState('')
  const [email,setEmail]=useState('')
  const [name,setName]=useState('')
  const [phone,setPhone]=useState('')
  const [country,setCountry]=useState('Lebanon')
  const [line1,setLine1]=useState('')
  const [city,setCity]=useState('Beirut')
  const [region,setRegion]=useState('')
  const [postalCode,setPostalCode]=useState('')
  const [productId,setProductId]=useState('')
  const [variantId,setVariantId]=useState('')
  const [qty,setQty]=useState(1)
  const [lines,setLines]=useState<Line[]>([])
  const [discount,setDiscount]=useState('')
  const [shipping,setShipping]=useState('')
  const [tax,setTax]=useState('')
  const [shippingMethod,setShippingMethod]=useState('Manual')
  const [paymentMethod,setPaymentMethod]=useState('COD')
  const [paymentStatus,setPaymentStatus]=useState('UNPAID')
  const [notes,setNotes]=useState('')
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)

  const selectedCustomer=customers.find(c=>c.id===customerId)
  const product=products.find(p=>p.id===productId)
  const variants=product?.variants||[]
  const selectedVariant=variants.find(v=>v.id===variantId)
  const unitPrice=selectedVariant?.price ?? product?.basePrice ?? 0
  const subtotal=useMemo(()=>lines.reduce((sum,l)=>sum+l.price*l.quantity,0),[lines])
  const discountValue=Math.max(0,Number(discount)||0)*100
  const shippingValue=Math.max(0,Number(shipping)||0)*100
  const taxValue=Math.max(0,Number(tax)||0)*100
  const total=Math.max(0,subtotal-discountValue+shippingValue+taxValue)

  function addLine(){
    if(!product) return setError('Select a product')
    const q=Math.min(99,Math.max(1,Math.floor(qty)))
    const existing=lines.find(l=>l.productId===product.id&&l.variantId===(selectedVariant?.id||null))
    if(existing){setLines(lines.map(l=>l===existing?{...l,quantity:Math.min(99,l.quantity+q)}:l))}
    else setLines([...lines,{productId:product.id,variantId:selectedVariant?.id||null,name:product.name+(selectedVariant?` — ${selectedVariant.name}`:''),sku:selectedVariant?.sku||product.sku,quantity:q,price:unitPrice}])
    setQty(1);setError('')
  }

  async function createOrder(){
    setSaving(true);setError('')
    try{
      const res=await fetch('/api/admin/orders/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId,email:email||selectedCustomer?.email,name:name||selectedCustomer?.name,phone:phone||selectedCustomer?.phone,country,line1,city,region,postalCode,items:lines.map(l=>({productId:l.productId,variantId:l.variantId,quantity:l.quantity})),discount:Number(discount||0)*100,shippingTotal:Number(shipping||0)*100,taxTotal:Number(tax||0)*100,shippingMethod,paymentMethod,paymentStatus,notes})})
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data.error||'Unable to create order')
      router.push(`/admin/orders/${data.order.id}`)
    }catch(e){setError(e instanceof Error?e.message:'Unable to create order');setSaving(false)}
  }

  return <div>
      <div className={ui.sectionHead}><div><Link className={ui.textLink} href="/admin/orders"><ArrowLeft size={15}/> Back to orders</Link><span className={`${ui.muted} ${ui.tiny}`} style={{display:'block',marginTop:12}}>COMMERCE</span><h1 className={ui.title}>Create manual order</h1><p className={ui.muted}>Create an order from a phone, message, walk-in customer or offline sale.</p></div><div className="inline"><span className={ui.pill}>Draft</span><button className={ui.btn} disabled={saving||!lines.length} onClick={createOrder}>{saving?'Creating…':'Create order'}</button></div></div>
      {error&&<div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>}
      <div className={s.grid}>
        <main className={s.main}>
          <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Customer</h3></div>
            <label className={ui.fieldLabel}>Existing customer<select className={ui.select} value={customerId} onChange={e=>{const id=e.target.value;setCustomerId(id);const c=customers.find(x=>x.id===id);if(c){setEmail(c.email);setName(c.name);setPhone(c.phone||'')}}}><option value="">Guest / manual customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select></label>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Name<input className={ui.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Customer name"/></label><label className={ui.fieldLabel}>Email<input className={ui.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@email.com"/></label></div>
            <label className={ui.fieldLabel}>Phone<input className={ui.input} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+961 ..."/></label>
          </section>

          <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Products</h3></div>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Product<select className={ui.select} value={productId} onChange={e=>{setProductId(e.target.value);setVariantId('')}}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {money(p.basePrice)}</option>)}</select></label><label className={ui.fieldLabel}>Variant<select className={ui.select} value={variantId} disabled={!variants.length} onChange={e=>setVariantId(e.target.value)}><option value="">Default / shared stock</option>{variants.map(v=><option key={v.id} value={v.id}>{v.name} — {money(v.price??product?.basePrice??0)}</option>)}</select></label></div>
            <div className="inline" style={{alignItems:'end'}}><label className={ui.fieldLabel} style={{maxWidth:140}}>Qty<input className={ui.input} type="number" min="1" max="99" value={qty} onChange={e=>setQty(Number(e.target.value)||1)}/></label><button className={`${ui.btn} ${ui.btnSecondary}`} onClick={addLine}>Add item</button></div>
            <div className={ui.tableWrap}><table className={ui.table}><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>{lines.map((l,i)=><tr key={`${l.productId}:${l.variantId||''}`}><td><strong>{l.name}</strong></td><td>{l.sku}</td><td><input className={ui.inputCompact} style={{width:80}} type="number" min="1" max="99" value={l.quantity} onChange={e=>setLines(lines.map((x,j)=>j===i?{...x,quantity:Math.min(99,Math.max(1,Number(e.target.value)||1))}:x))}/></td><td>{money(l.price*l.quantity)}</td><td><button className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={()=>setLines(lines.filter((_,j)=>j!==i))}>Remove</button></td></tr>)}</tbody></table></div>
          </section>

          <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Shipping address</h3></div>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Country<input className={ui.input} value={country} onChange={e=>setCountry(e.target.value)}/></label><label className={ui.fieldLabel}>City<input className={ui.input} value={city} onChange={e=>setCity(e.target.value)}/></label></div>
            <label className={ui.fieldLabel}>Address<input className={ui.input} value={line1} onChange={e=>setLine1(e.target.value)} placeholder="Street, building, apartment…"/></label>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Region<input className={ui.input} value={region} onChange={e=>setRegion(e.target.value)}/></label><label className={ui.fieldLabel}>Postal code<input className={ui.input} value={postalCode} onChange={e=>setPostalCode(e.target.value)}/></label></div>
          </section>

          <section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Payment & fulfillment</h3></div>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Payment method<select className={ui.select} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option>COD</option><option>BANK_TRANSFER</option><option>WALLET</option><option>CARD</option></select></label><label className={ui.fieldLabel}>Payment status<select className={ui.select} value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)}><option>UNPAID</option><option>PENDING</option><option>PAID</option><option>FAILED</option></select></label></div>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Shipping method<input className={ui.input} value={shippingMethod} onChange={e=>setShippingMethod(e.target.value)}/></label><label className={ui.fieldLabel}>Shipping amount<input className={ui.input} type="number" min="0" step="0.01" value={shipping} onChange={e=>setShipping(e.target.value)}/></label></div>
            <div className={s.twoCol}><label className={ui.fieldLabel}>Discount<input className={ui.input} type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label><label className={ui.fieldLabel}>Tax<input className={ui.input} type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)}/></label></div>
            <label className={ui.fieldLabel}>Internal note<textarea className={ui.textarea} rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional note for staff…"/></label>
          </section>
        </main>
        <aside className={s.rail}><section className={ui.card}><div className={`${ui.sectionHead} ${ui.sectionHeadSmall}`}><h3>Order summary</h3></div><div className={s.summaryLine}><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className={s.summaryLine}><span>Discount</span><strong>- {money(discountValue)}</strong></div><div className={s.summaryLine}><span>Shipping</span><strong>{money(shippingValue)}</strong></div><div className={s.summaryLine}><span>Tax</span><strong>{money(taxValue)}</strong></div><div className={`${s.summaryLine} ${s.summaryLineTotal}`}><span>Total</span><strong>{money(total)}</strong></div><button className={`${ui.btn} ${ui.btnWide}`} disabled={saving||!lines.length} onClick={createOrder}>{saving?'Creating…':'Create order'}</button></section></aside>
      </div>
  </div>
}

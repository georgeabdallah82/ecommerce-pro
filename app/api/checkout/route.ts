import { createHash } from 'node:crypto'
import { db } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { checkoutSchema } from '@/lib/validation'
import { json } from '@/lib/utils'
import { calculateShipping, getTaxRatePercent } from '@/lib/pricing'
import { releaseOrderReservations, reserveStock } from '@/lib/inventory'
import { getPaymentProvider } from '@/lib/payments'
import { sendNewOrderPush } from '@/lib/push'
import { consumeRateLimit } from '@/lib/rate-limit'
import { PaymentMethod } from '@prisma/client'

function stableSerialize(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`; return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}` }
function clientIp(req: Request) { return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' }
function checkoutFingerprint(userId: string | null, input: any, merged: Map<string, { productId: string; variantId: string | null; quantity: number }>) { const items=[...merged.values()].sort((a,b)=>`${a.productId}:${a.variantId??''}`.localeCompare(`${b.productId}:${b.variantId??''}`)); return createHash('sha256').update(stableSerialize({userId,email:input.email,phone:input.phone||null,items,couponCode:input.couponCode||null,paymentMethod:input.paymentMethod,shippingAddress:input.shippingAddress})).digest('hex') }

async function applyCoupon(code: string, subtotal: number) {
  if (!code) return { discount: 0, coupon: null as any }
  const coupon=await db.coupon.findUnique({where:{code:code.toUpperCase()}}); const now=new Date()
  if(!coupon||!coupon.isActive)throw new Error('Invalid coupon code'); if(coupon.type==='PERCENTAGE'&&(coupon.value<1||coupon.value>100))throw new Error('This discount is not configured correctly'); if(coupon.startsAt&&coupon.startsAt>now)throw new Error('This coupon is not active yet'); if(coupon.expiresAt&&coupon.expiresAt<now)throw new Error('This coupon has expired'); if(coupon.maxUses!==null&&coupon.usedCount>=coupon.maxUses)throw new Error('This coupon has reached its usage limit'); if(coupon.minSubtotal!==null&&subtotal<coupon.minSubtotal)throw new Error('Minimum order is required for this coupon')
  const discount=coupon.type==='PERCENTAGE'?Math.min(subtotal,Math.floor(subtotal*coupon.value/100)):coupon.type==='FIXED'?Math.min(subtotal,coupon.value):0; return {discount,coupon}
}

function providerCheckout(rawJson: string | null) {
  if (!rawJson) return null
  try { const parsed=JSON.parse(rawJson) as { clientCheckout?: unknown }; return parsed.clientCheckout || null } catch { return null }
}

export async function POST(req: Request) {
  try {
    const currentIp = clientIp(req)
    const user = await getCurrentUser()
    const limitKey = user?.id ? `checkout:user:${user.id}` : `checkout:ip:${currentIp}`
    const limit = consumeRateLimit(limitKey, 20, 10 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many checkout attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } })

    const rawBody = await req.text()
    if (rawBody.length > 100_000) return json({ error: 'Checkout request is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
    const input=checkoutSchema.parse(JSON.parse(rawBody)); const idempotencyKey=req.headers.get('x-idempotency-key')?.trim().slice(0,190)||null; const paymentMethod=input.paymentMethod as PaymentMethod; const paymentProvider=await getPaymentProvider()
    const settingRows=await db.setting.findMany({where:{key:{in:['payment.cod','payment.card','payment.bank','payment.wallet','checkout.guestCheckout']}},select:{key:true,value:true}}); const settings=Object.fromEntries(settingRows.map(row=>[row.key,row.value])); const guestCheckoutEnabled=settings['checkout.guestCheckout']!=='false'
    const paymentEnabled:Record<PaymentMethod,boolean>={COD:settings['payment.cod']!=='false',CARD:settings['payment.card']==='true'&&paymentProvider.name!=='manual',BANK_TRANSFER:settings['payment.bank']==='true',WALLET:settings['payment.wallet']==='true'}
    if(!user?.id&&!guestCheckoutEnabled)return json({error:'Guest checkout is disabled. Please sign in to continue.'},{status:403}); if(!paymentEnabled[paymentMethod])return json({error:'This payment method is currently unavailable.'},{status:400})

    const merged=new Map<string,{productId:string;variantId:string|null;quantity:number}>()
    for(const item of input.items){const key=`${item.productId}:${item.variantId??''}`;const current=merged.get(key);const quantity=(current?.quantity??0)+item.quantity;if(quantity>99)throw new Error('Maximum quantity per product is 99');merged.set(key,{productId:item.productId,variantId:item.variantId??null,quantity})}
    if(merged.size===0)return json({error:'Your cart is empty.'},{status:400})
    const ids=[...new Set([...merged.values()].map(i=>i.productId))]; const products=await db.product.findMany({where:{id:{in:ids},status:'ACTIVE'},include:{variants:true,inventory:true,images:true}}); const byId=new Map(products.map(p=>[p.id,p])); if(products.length!==ids.length)return json({error:'One or more products are unavailable'},{status:400})
    const normalized:any[]=[]; let subtotal=0
    for(const raw of merged.values()){const p=byId.get(raw.productId)!;const variant=raw.variantId?p.variants.find(v=>v.id===raw.variantId):undefined;if(raw.variantId&&!variant)return json({error:'Invalid product option selected.'},{status:400});if(p.trackInventory&&!p.continueSellingWhenOutOfStock){const dedicated=raw.variantId?p.inventory.filter(x=>x.variantId===raw.variantId):[];const stockRows=dedicated.length?dedicated:p.inventory.filter(x=>!x.variantId);const available=stockRows.reduce((s,x)=>s+x.quantity-x.reserved,0);if(available<raw.quantity)return json({error:'One or more requested quantities are no longer available.'},{status:409})}const unitPrice=variant?.price??p.basePrice;subtotal+=unitPrice*raw.quantity;normalized.push({productId:p.id,variantId:variant?.id??null,name:p.name+(variant?` — ${variant.name}`:''),sku:variant?.sku??p.sku,quantity:raw.quantity,unitPrice,totalPrice:unitPrice*raw.quantity})}
    const {discount,coupon}=await applyCoupon(input.couponCode||'',subtotal); if(coupon?.firstOrderOnly&&!user?.id)throw new Error('This coupon requires a customer account'); const discountedSubtotal=Math.max(0,subtotal-discount); const shipping=await calculateShipping(input.shippingAddress.country,discountedSubtotal); const taxRate=await getTaxRatePercent(); const taxTotal=Math.round(discountedSubtotal*taxRate/100); const shippingTotal=coupon?.type==='FREE_SHIPPING'?0:shipping.total; const grandTotal=Math.max(0,discountedSubtotal+shippingTotal+taxTotal); const orderNumber=`ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; const fingerprint=checkoutFingerprint(user?.id??null,input,merged)

    const result=await db.$transaction(async tx=>{
      if(idempotencyKey){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;const existing=await tx.paymentTransaction.findFirst({where:{provider:'checkout',externalId:idempotencyKey},include:{order:true}});if(existing?.order){let existingFingerprint:string|null=null;if(existing.rawJson){try{const parsed=JSON.parse(existing.rawJson) as {fingerprint?:unknown};existingFingerprint=typeof parsed.fingerprint==='string'?parsed.fingerprint:null}catch{existingFingerprint=null}}if(existingFingerprint&&existingFingerprint!==fingerprint)throw new Error('This idempotency key was already used for a different checkout');return {existing:true as const,order:existing.order}}}
      if(coupon?.firstOrderOnly&&user?.id){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`first-order:${user.id}`}))`;const existingOrder=await tx.order.findFirst({where:{userId:user.id,status:{not:'CANCELLED'}},select:{id:true}});if(existingOrder)throw new Error('This coupon is for first orders only')}
      for(const item of normalized)await reserveStock(tx,byId.get(item.productId)!,item.variantId,item.quantity,orderNumber)
      if(coupon){const couponUpdate=await tx.coupon.updateMany({where:{id:coupon.id,isActive:true,...(coupon.maxUses!==null?{usedCount:{lt:coupon.maxUses}}:{})},data:{usedCount:{increment:1}}});if(couponUpdate.count!==1)throw new Error('This coupon is no longer available')}
      const order=await tx.order.create({data:{orderNumber,userId:user?.id??null,email:input.email,phone:input.phone||null,subtotal,discountTotal:discount,shippingTotal,taxTotal,grandTotal,currency:process.env.NEXT_PUBLIC_CURRENCY||'USD',paymentMethod,shippingAddressJson:JSON.stringify(input.shippingAddress),couponCode:coupon?.code??null,shippingMethod:shipping.method,items:{create:normalized},events:{create:{status:'PENDING',message:'Order placed successfully.'}},paymentTransactions:{create:{provider:'checkout',externalId:idempotencyKey,status:'created',amount:grandTotal,currency:process.env.NEXT_PUBLIC_CURRENCY||'USD',rawJson:idempotencyKey?JSON.stringify({fingerprint}):null}}}});return {existing:false as const,order}
    })

    if(result.existing){
      const providerTx=paymentMethod===PaymentMethod.CARD?await db.paymentTransaction.findFirst({where:{orderId:result.order.id,provider:paymentProvider.name},orderBy:{createdAt:'desc'}}):null
      return json({order:{id:result.order.id,orderNumber:result.order.orderNumber,total:result.order.grandTotal},payment:providerCheckout(providerTx?.rawJson||null)},{status:200,headers:{'Cache-Control':'no-store'}})
    }

    const order=result.order; let clientCheckout:any=null
    if(paymentMethod===PaymentMethod.CARD){try{const payment=await paymentProvider.createPayment({orderId:order.orderNumber,amount:order.grandTotal,currency:order.currency,email:order.email});if(payment.externalId){await db.paymentTransaction.create({data:{orderId:order.id,provider:payment.provider,externalId:payment.externalId,status:payment.status,amount:order.grandTotal,currency:order.currency,rawJson:JSON.stringify({clientCheckout:payment.clientCheckout?{type:payment.clientCheckout.type,merchantId:payment.clientCheckout.merchantId,sessionId:payment.clientCheckout.sessionId}:null,successIndicator:payment.clientCheckout?.successIndicator||null})}})}clientCheckout=payment.clientCheckout||null}catch(paymentError){await db.$transaction(async tx=>{await releaseOrderReservations(tx,order.id,'Online payment initialization failed');if(order.couponCode){await tx.coupon.updateMany({where:{code:order.couponCode,usedCount:{gt:0}},data:{usedCount:{decrement:1}}})}await tx.order.update({where:{id:order.id},data:{status:'CANCELLED',fulfillmentStatus:'UNFULFILLED',events:{create:{status:'CANCELLED',message:'Online payment initialization failed.'}}}})});throw paymentError}}
    if(user?.id)await db.notification.create({data:{userId:user.id,title:'Order placed',body:`Order ${order.orderNumber} was placed successfully.`,type:'ORDER_CREATED'}}); void sendNewOrderPush({id:order.id,orderNumber:order.orderNumber,grandTotal:order.grandTotal,currency:order.currency}).catch(error=>console.error('[push] new-order notification failed',error)); await audit(user?.id,'order.created','Order',order.id,{orderNumber,total:grandTotal,paymentMethod,paymentProvider:paymentMethod===PaymentMethod.CARD?paymentProvider.name:'manual'}); return json({order:{id:order.id,orderNumber:order.orderNumber,total:order.grandTotal},payment:clientCheckout},{status:201,headers:{'Cache-Control':'no-store'}})
  } catch(error){const message=error instanceof Error?error.message:'Unable to place order';const status=message==='This idempotency key was already used for a different checkout'?409:400;return json({error:message},{status,headers:{'Cache-Control':'no-store'}})}
}

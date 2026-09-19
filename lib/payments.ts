import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/prisma'
import { decryptPaymentSecret } from '@/lib/payment-config'

export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed'
export type PaymentCreateInput = { orderId: string; amount: number; currency: string; email?: string; returnUrl?: string }
export type PaymentCreateResult = { provider: string; externalId?: string; checkoutUrl?: string; clientCheckout?: { type: 'mpgs'; merchantId: string; sessionId: string; scriptUrl: string; successIndicator?: string }; status: PaymentStatus }
export interface PaymentProvider { readonly name: string; createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>; getPaymentStatus(externalId: string, orderId: string): Promise<'pending' | 'paid' | 'failed'>; refundPayment?(externalId: string, amount: number, currency: string): Promise<'pending' | 'refunded'> }

export const manualPaymentProvider: PaymentProvider = { name: 'manual', async createPayment() { return { provider: 'manual', status: 'created' } }, async getPaymentStatus() { return 'pending' } }
function setting(map: Map<string, string>, key: string, fallback = '') { return map.get(key) || fallback }
function authDerivedToken(prefix: string, value: string) { const secret = process.env.AUTH_SECRET; if (!secret) throw new Error('AUTH_SECRET is required'); return createHash('sha256').update(`${prefix}:${secret}:${value}`).digest('hex') }
export function areebaWebhookToken() { return authDerivedToken('areeba-webhook', '') }
export function paymentReturnToken(orderNumber: string) { return authDerivedToken('areeba-return', orderNumber) }
export function draftInvoiceToken(draftOrderId: string) { return authDerivedToken('draft-invoice', draftOrderId) }
export function safeTokenEqual(a: string, b: string) { try { const left=Buffer.from(a,'utf8'); const right=Buffer.from(b,'utf8'); return left.length===right.length && timingSafeEqual(left,right) } catch { return false } }

async function getAreebaConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: ['payment.areeba.merchantId','payment.areeba.merchantName','payment.areeba.apiBaseUrl','payment.areeba.apiVersion','payment.areeba.checkoutScriptUrl','payment.areeba.apiPassword'] } } })
  const map = new Map(rows.map(row => [row.key, row.value]))
  const encrypted = setting(map, 'payment.areeba.apiPassword')
  if (!encrypted) throw new Error('Areeba API password is not configured')
  const base = new URL(setting(map, 'payment.areeba.apiBaseUrl','https://epayment.areeba.com/api/rest'))
  if (base.protocol !== 'https:' || base.hostname !== 'epayment.areeba.com') throw new Error('Areeba API base URL must use the trusted Areeba host')
  const script = new URL(setting(map, 'payment.areeba.checkoutScriptUrl', 'https://epayment.areeba.com/static/checkout/checkout.min.js'))
  if (script.protocol !== 'https:' || script.hostname !== 'epayment.areeba.com') throw new Error('Areeba checkout script URL must use the trusted Areeba host')
  return { merchantId: setting(map,'payment.areeba.merchantId'), merchantName: setting(map,'payment.areeba.merchantName'), apiBaseUrl: base.toString().replace(/\/$/,''), apiVersion: setting(map,'payment.areeba.apiVersion','78'), checkoutScriptUrl: script.toString(), apiPassword: decryptPaymentSecret(encrypted) }
}

const safeError = (body: unknown) => { if (!body || typeof body !== 'object') return 'Payment gateway rejected the request'; const record=body as Record<string,any>; if(typeof record.error?.explanation==='string')return record.error.explanation; if(typeof record.error?.message==='string')return record.error.message; if(typeof record.message==='string')return record.message; return 'Payment gateway rejected the request' }

export const areebaMpgsPaymentProvider: PaymentProvider = {
  name: 'areeba_mpgs',
  async createPayment(input) {
    const config=await getAreebaConfig(); if(!config.merchantId||!config.merchantName)throw new Error('Areeba merchant configuration is incomplete')
    const siteUrl=process.env.NEXT_PUBLIC_SITE_URL; if(!siteUrl)throw new Error('NEXT_PUBLIC_SITE_URL is required for online payments')
    const webhookUrl=`${siteUrl}/api/payments/areeba/webhook?token=${areebaWebhookToken()}`
    const endpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/session`
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`).toString('base64')}`},body:JSON.stringify({apiOperation:'INITIATE_CHECKOUT',checkoutMode:'WEBSITE',interaction:{operation:'PURCHASE',merchant:{name:config.merchantName,url:siteUrl},returnUrl:input.returnUrl||`${siteUrl}/api/payments/areeba/return?order=${encodeURIComponent(input.orderId)}&token=${encodeURIComponent(paymentReturnToken(input.orderId))}`},order:{id:input.orderId,amount:(input.amount/100).toFixed(2),currency:input.currency,description:`Order ${input.orderId}`,notificationUrl:webhookUrl}})})
    const body=await response.json().catch(()=>({})) as Record<string,any>; const sessionId=typeof body.session?.id==='string'?body.session.id:''; const successIndicator=typeof body.successIndicator==='string'?body.successIndicator:''
    if(!response.ok||body.result==='ERROR'||!sessionId)throw new Error(safeError(body))
    return {provider:this.name,externalId:sessionId,clientCheckout:{type:'mpgs',merchantId:config.merchantId,sessionId,scriptUrl:config.checkoutScriptUrl,successIndicator:successIndicator||undefined},status:'pending'}
  },
  async getPaymentStatus(_externalId,orderId) {
    const config=await getAreebaConfig(); const endpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/order/${encodeURIComponent(orderId)}`
    const response=await fetch(endpoint,{headers:{authorization:`Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`).toString('base64')}`},cache:'no-store'})
    const body=await response.json().catch(()=>({})) as Record<string,any>; if(!response.ok)throw new Error(safeError(body))
    const status=String(body.order?.status||'').toUpperCase(); if(['CAPTURED','AUTHORIZED','PARTIALLY_CAPTURED'].includes(status))return 'paid'; if(['FAILED','CANCELLED','REFUNDED','EXCESSIVELY_REFUNDED'].includes(status))return 'failed'; return 'pending'
  },
  async refundPayment(externalId, amount, currency) {
    // Extended (Accelerate) client payload inference doesn't always widen nested `include`
    // relations correctly, so the result is asserted to the shape actually queried.
    const localTransaction = await db.paymentTransaction.findFirst({ where: { externalId, provider: 'areeba_mpgs', status: { in: ['paid', 'captured', 'authorized'] } }, include: { order: { select: { orderNumber: true, grandTotal: true, currency: true } } } }) as { currency: string; amount: number; order: { orderNumber: string; grandTotal: number; currency: string } } | null
    if (!localTransaction) throw new Error('Areeba payment transaction not found')
    if (localTransaction.currency !== currency || amount <= 0 || amount > localTransaction.amount) throw new Error('Invalid refund amount or currency')
    const config=await getAreebaConfig()
    const orderEndpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/order/${encodeURIComponent(localTransaction.order.orderNumber)}`
    const auth={authorization:`Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`).toString('base64')}`}
    const orderResponse=await fetch(orderEndpoint,{headers:auth,cache:'no-store'}); const orderBody=await orderResponse.json().catch(()=>({})) as Record<string,any>
    if(!orderResponse.ok)throw new Error(safeError(orderBody))
    const transactions=Array.isArray(orderBody.transaction)?orderBody.transaction as Array<Record<string,any>>:[]
    const refundable=transactions.filter(tx=>['PAYMENT','CAPTURE'].includes(String(tx.transaction?.type||'').toUpperCase())&&['APPROVED','APPROVED_PENDING_SETTLEMENT'].includes(String(tx.response?.gatewayCode||'').toUpperCase())).sort((a,b)=>String(b.transaction?.time||'').localeCompare(String(a.transaction?.time||'')))[0]
    const targetId=typeof refundable?.transaction?.id==='string'?refundable.transaction.id:''
    if(!targetId)throw new Error('No captured Areeba transaction is available for refund')
    const refundTransactionId=`refund-${randomUUID().replace(/-/g,'').slice(0,24)}`
    const refundEndpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/order/${encodeURIComponent(localTransaction.order.orderNumber)}/transaction/${encodeURIComponent(refundTransactionId)}`
    const response=await fetch(refundEndpoint,{method:'PUT',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({apiOperation:'REFUND',transaction:{amount:(amount/100).toFixed(2),currency,targetTransactionId:targetId}})})
    const body=await response.json().catch(()=>({})) as Record<string,any>; const result=String(body.result||'').toUpperCase()
    if(!response.ok||body.result==='ERROR'||!['SUCCESS','PENDING'].includes(result))throw new Error(safeError(body))
    return result==='PENDING'?'pending':'refunded'
  },
}

export async function getPaymentProvider(requestedName?: string): Promise<PaymentProvider> {
  if (requestedName === 'manual') return manualPaymentProvider
  if (requestedName === 'areeba_mpgs') return areebaMpgsPaymentProvider
  const rows=await db.setting.findMany({where:{key:{in:['payment.provider','payment.card']}}}); const map=new Map(rows.map(row=>[row.key,row.value])); const name=(map.get('payment.provider')||process.env.PAYMENT_PROVIDER||'manual').toLowerCase(); const enabled=map.get('payment.card')!=='false'
  if(!enabled||name==='manual')return manualPaymentProvider; if(name==='areeba_mpgs')return areebaMpgsPaymentProvider; throw new Error(`Payment provider ${name} is not configured`)
}

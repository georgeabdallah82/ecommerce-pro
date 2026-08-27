import { db } from '@/lib/prisma'
import { decryptPaymentSecret } from '@/lib/payment-config'

export type PaymentCreateInput = { orderId: string; amount: number; currency: string; email?: string; returnUrl?: string }
export type PaymentCreateResult = { provider: string; externalId?: string; checkoutUrl?: string; clientCheckout?: { type: 'mpgs'; merchantId: string; sessionId: string; scriptUrl: string }; status: 'created' | 'pending' | 'paid' | 'failed' }
export interface PaymentProvider { readonly name: string; createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>; getPaymentStatus?(externalId: string, orderId: string): Promise<'pending' | 'paid' | 'failed'>; refund?(externalId: string, amount: number, currency: string): Promise<void> }

export const manualPaymentProvider: PaymentProvider = { name: 'manual', async createPayment() { return { provider: 'manual', status: 'created' } } }
function setting(map: Map<string, string>, key: string, fallback = '') { return map.get(key) || fallback }

async function getAreebaConfig() {
  const rows = await db.setting.findMany({ where: { key: { in: ['payment.areeba.merchantId','payment.areeba.merchantName','payment.areeba.apiBaseUrl','payment.areeba.apiVersion','payment.areeba.checkoutScriptUrl','payment.areeba.apiPassword'] } } })
  const map = new Map(rows.map(row => [row.key, row.value]))
  const encrypted = setting(map, 'payment.areeba.apiPassword')
  if (!encrypted) throw new Error('Areeba API password is not configured')
  return { merchantId: setting(map,'payment.areeba.merchantId'), merchantName: setting(map,'payment.areeba.merchantName'), apiBaseUrl: setting(map,'payment.areeba.apiBaseUrl','https://epayment.areeba.com/api/rest'), apiVersion: setting(map,'payment.areeba.apiVersion','78'), checkoutScriptUrl: setting(map,'payment.areeba.checkoutScriptUrl','https://epayment.areeba.com/static/checkout/checkout.min.js'), apiPassword: decryptPaymentSecret(encrypted) }
}

const safeError = (body: unknown) => { if (!body || typeof body !== 'object') return 'Payment gateway rejected the request'; const record=body as Record<string,any>; if(typeof record.error?.explanation==='string')return record.error.explanation; if(typeof record.error?.message==='string')return record.error.message; if(typeof record.message==='string')return record.message; return 'Payment gateway rejected the request' }

export const areebaMpgsPaymentProvider: PaymentProvider = {
  name: 'areeba_mpgs',
  async createPayment(input) {
    const config=await getAreebaConfig(); if(!config.merchantId||!config.merchantName)throw new Error('Areeba merchant configuration is incomplete')
    const siteUrl=process.env.NEXT_PUBLIC_SITE_URL; if(!siteUrl)throw new Error('NEXT_PUBLIC_SITE_URL is required for online payments')
    const endpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/session`
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`).toString('base64')}`},body:JSON.stringify({apiOperation:'INITIATE_CHECKOUT',checkoutMode:'WEBSITE',interaction:{operation:'PURCHASE',merchant:{name:config.merchantName,url:siteUrl},returnUrl:input.returnUrl||`${siteUrl}/api/payments/areeba/return?order=${encodeURIComponent(input.orderId)}`},order:{id:input.orderId,amount:(input.amount/100).toFixed(2),currency:input.currency,description:`Order ${input.orderId}`,notificationUrl:`${siteUrl}/api/payments/areeba/webhook`}})})
    const body=await response.json().catch(()=>({})) as Record<string,any>; const sessionId=typeof body.session?.id==='string'?body.session.id:''
    if(!response.ok||body.result==='ERROR'||!sessionId)throw new Error(safeError(body))
    return {provider:this.name,externalId:sessionId,clientCheckout:{type:'mpgs',merchantId:config.merchantId,sessionId,scriptUrl:config.checkoutScriptUrl},status:'pending'}
  },
  async getPaymentStatus(_externalId,orderId) {
    const config=await getAreebaConfig(); const endpoint=`${config.apiBaseUrl}/version/${encodeURIComponent(config.apiVersion)}/merchant/${encodeURIComponent(config.merchantId)}/order/${encodeURIComponent(orderId)}`
    const response=await fetch(endpoint,{headers:{authorization:`Basic ${Buffer.from(`merchant.${config.merchantId}:${config.apiPassword}`).toString('base64')}`},cache:'no-store'})
    const body=await response.json().catch(()=>({})) as Record<string,any>; if(!response.ok)throw new Error(safeError(body))
    const status=String(body.order?.status||'').toUpperCase(); if(['CAPTURED','AUTHORIZED','PARTIALLY_CAPTURED'].includes(status))return 'paid'; if(['FAILED','CANCELLED','REFUNDED','EXCESSIVELY_REFUNDED'].includes(status))return 'failed'; return 'pending'
  },
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  const rows=await db.setting.findMany({where:{key:{in:['payment.provider','payment.card']}}}); const map=new Map(rows.map(row=>[row.key,row.value])); const name=(map.get('payment.provider')||process.env.PAYMENT_PROVIDER||'manual').toLowerCase(); const enabled=map.get('payment.card')!=='false'
  if(!enabled||name==='manual')return manualPaymentProvider; if(name==='areeba_mpgs')return areebaMpgsPaymentProvider; throw new Error(`Payment provider ${name} is not configured`)
}

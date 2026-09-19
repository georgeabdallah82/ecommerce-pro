import { db } from '@/lib/prisma'
import { getPaymentProvider } from '@/lib/payments'
import { json } from '@/lib/utils'
import { getPublicPaymentMethods } from '@/lib/payment-methods-public'
import { config } from '@/lib/config'

const PUBLIC_KEYS = [
  'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
  'checkout.guestCheckout', 'checkout.freeShippingThreshold', 'checkout.taxRatePercent',
  'store.currency', 'store.country', 'contact.email', 'contact.phone',
]

export async function GET(){
  try{
    const [rows,paymentProvider,paymentMethods]=await Promise.all([
      db.setting.findMany({where:{key:{in:PUBLIC_KEYS}},select:{key:true,value:true}}),
      Promise.resolve(getPaymentProvider()),
      getPublicPaymentMethods(),
    ])
    const map=Object.fromEntries(rows.map(row=>[row.key,row.value]))
    return json({settings:{
      payment:{
        cod:map['payment.cod']!=='false',
        card:map['payment.card']==='true' && paymentProvider.name!=='manual',
        bank:map['payment.bank']==='true',
        wallet:map['payment.wallet']==='true',
        details: paymentMethods,
      },
      checkout:{guestCheckout:map['checkout.guestCheckout']!=='false',freeShippingThreshold:map['checkout.freeShippingThreshold']||'100',taxRatePercent:map['checkout.taxRatePercent']||'0'},
      store:{currency:map['store.currency']||'USD',country:map['store.country']||'Lebanon'},
      contact:{email:map['contact.email']?.trim()||config.supportEmail,phone:map['contact.phone']?.trim()||config.whatsapp},
    }},{headers:{'Cache-Control':'public, max-age=30, s-maxage=120, stale-while-revalidate=600'}})
  }catch{return json({error:'Unable to load store settings'},{status:500})}
}

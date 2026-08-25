import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'

const PUBLIC_KEYS = [
  'payment.cod', 'payment.card', 'payment.bank', 'payment.wallet',
  'checkout.guestCheckout', 'checkout.freeShippingThreshold', 'checkout.taxRatePercent',
  'store.currency', 'store.country',
]

export async function GET(){
  try{
    const rows=await db.setting.findMany({where:{key:{in:PUBLIC_KEYS}},select:{key:true,value:true}})
    const map=Object.fromEntries(rows.map(row=>[row.key,row.value]))
    return json({settings:{
      payment:{cod:map['payment.cod']!=='false',card:map['payment.card']==='true',bank:map['payment.bank']==='true',wallet:map['payment.wallet']==='true'},
      checkout:{guestCheckout:map['checkout.guestCheckout']!=='false',freeShippingThreshold:map['checkout.freeShippingThreshold']||'100',taxRatePercent:map['checkout.taxRatePercent']||'0'},
      store:{currency:map['store.currency']||'USD',country:map['store.country']||'Lebanon'},
    }})
  }catch(e){return json({error:e instanceof Error?e.message:'Unable to load store settings'},{status:500})}
}

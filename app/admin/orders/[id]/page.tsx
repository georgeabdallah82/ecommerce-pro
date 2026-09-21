import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import OrderDetailAdmin from '@/components/order-detail-admin'
import ui from '@/components/admin-ui.module.css'

export default async function OrderDetail({params}:{params:Promise<{id:string}>}){
  const user = await requirePermission('orders.view')
  const {id}=await params
  const storeTimezone = await getStoreTimezone()
  const order=await db.order.findUnique({
    where:{id},
    include:{
      user:true,
      items:{include:{product:{include:{images:true}},variant:true}},
      events:{orderBy:{createdAt:'desc'}},
      notesHistory:{include:{user:true},orderBy:{createdAt:'desc'}},
      paymentTransactions:{orderBy:{createdAt:'desc'}}
    }
  })
  if(!order)return <div className={ui.empty}>Order not found.</div>
  const canStartOrderEdit = hasPermission(user.role, 'orderEdits.manage') && !['CANCELLED','REFUNDED'].includes(order.status)
  // Fulfillment has no navigable relation back to Order (only a scalar orderId), same reasoning
  // as ReturnRequest's order lookup elsewhere in this app -- fetched separately and stitched on.
  const fulfillments = await db.fulfillment.findMany({ where: { orderId: order.id }, include: { lines: true }, orderBy: { createdAt: 'desc' } })
  // GiftCard has no orderId relation -- issueGiftCardsForOrder (lib/gift-cards.ts) tags
  // the ones it mints with a `note` naming this order's number, so that's how they're found again.
  const issuedGiftCards = await db.giftCard.findMany({ where: { note: `Issued from order ${order.orderNumber}` } })
  return <OrderDetailAdmin initial={JSON.parse(JSON.stringify({ ...order, fulfillments, issuedGiftCards }))} canStartOrderEdit={canStartOrderEdit} storeTimezone={storeTimezone}/>
}

import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { getBlockedPhones, isBlocked } from '@/lib/blocked-phones'
import { orderReviewPath, orderViewToken } from '@/lib/order-access'
import { phoneHistory } from '@/lib/customer-history'
import { BEFORE_SENDING, riskForOrders } from '@/lib/order-risk'
import { requestOrigin } from '@/lib/site-url'
import OrderDetailAdmin from '@/components/order-detail-admin'
import ui from '@/components/admin-ui.module.css'

export default async function OrderDetail({params}:{params:Promise<{id:string}>}){
  const user = await requirePermission('orders.view')
  const {id}=await params
  const [storeTimezone, store, blockedList] = await Promise.all([getStoreTimezone(), getStoreIdentity(), getBlockedPhones().catch(() => [])])
  const order=await db.order.findUnique({
    where:{id},
    include:{
      user:true,
      driver:{select:{id:true,name:true}},
      items:{include:{product:{include:{images:true}},variant:true}},
      events:{orderBy:{createdAt:'desc'}},
      notesHistory:{include:{user:true},orderBy:{createdAt:'desc'}},
      paymentTransactions:{orderBy:{createdAt:'desc'}},
      // Screenshots of a bank or wallet transfer the customer sent (lib/payment-proof.ts); the pictures load through a staff-only route.
      paymentProofs:{select:{id:true,createdAt:true,sizeBytes:true},orderBy:{createdAt:'desc'}}
    }
  })
  if(!order)return <div className={ui.empty}>Order not found.</div>
  const canStartOrderEdit = hasPermission(user, 'orderEdits.manage') && !['CANCELLED','REFUNDED'].includes(order.status)
  // Fulfillment has no navigable relation back to Order (only a scalar orderId), same reasoning
  // as ReturnRequest's order lookup elsewhere in this app -- fetched separately and stitched on.
  const fulfillments = await db.fulfillment.findMany({ where: { orderId: order.id }, include: { lines: true }, orderBy: { createdAt: 'desc' } })
  // GiftCard has no orderId relation -- issueGiftCardsForOrder (lib/gift-cards.ts) tags
  // the ones it mints with a `note` naming this order's number, so that's how they're found again.
  const issuedGiftCards = await db.giftCard.findMany({ where: { note: `Issued from order ${order.orderNumber}` } })
  // Links for the customer (lib/order-access.ts): follow the order (sent with the WhatsApp
  // updates), and "rate your order" once it is delivered.
  const origin = await requestOrigin()
  const trackLink = `${origin}/account/orders/${encodeURIComponent(order.orderNumber)}?t=${orderViewToken(order.orderNumber)}`
  const reviewLink = order.status === 'DELIVERED' ? `${origin}${orderReviewPath(order.orderNumber)}` : ''
  // Other orders from the same phone number (lib/customer-history.ts); the page works without it.
  const history = await phoneHistory(order.id, order.phone || (() => { try { return JSON.parse(order.shippingAddressJson || '{}').phone } catch { return '' } })(), store.country).catch(error => { console.error('[orders] phone history failed', error); return null })
  // A number that refused a parcel or did not answer the driver before (lib/order-risk.ts); only
  // while the order can still be stopped. The page works without it.
  const risk = BEFORE_SENDING.has(order.status) ? (await riskForOrders([order], store.country).catch(error => { console.error('[orders] risk check failed', error); return null }))?.get(order.id) || null : null
  return <OrderDetailAdmin reviewLink={reviewLink} trackLink={trackLink} history={history} risk={risk} initial={JSON.parse(JSON.stringify({ ...order, fulfillments, issuedGiftCards }))} canStartOrderEdit={canStartOrderEdit} storeTimezone={storeTimezone} storeName={store.name} storeCountry={store.country} phoneBlocked={isBlocked(blockedList, [order.phone, (() => { try { return JSON.parse(order.shippingAddressJson || '{}').phone } catch { return '' } })()], store.country)}/>
}

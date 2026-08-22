import {requirePermission} from '@/lib/auth'
import {db} from '@/lib/prisma'
import OrderDetailAdmin from '@/components/order-detail-admin'
export default async function OrderDetail({params}:{params:Promise<{id:string}>}){
  await requirePermission('orders.view')
  const {id}=await params
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
  if(!order)return <div className="empty">Order not found.</div>
  return <OrderDetailAdmin initial={JSON.parse(JSON.stringify(order))}/>
}

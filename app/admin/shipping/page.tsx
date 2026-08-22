import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { ShippingAdmin } from '@/components/admin-resource';
export default async function Shipping(){await requirePermission('shipping.view');return <ShippingAdmin initial={await db.shippingZone.findMany({include:{rates:true},orderBy:{name:'asc'}})}/>} 

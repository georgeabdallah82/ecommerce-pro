import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { CouponsAdmin } from '@/components/admin-resource';
export default async function Coupons(){await requirePermission('coupons.view');return <CouponsAdmin initial={await db.coupon.findMany({orderBy:{createdAt:'desc'}})}/>} 

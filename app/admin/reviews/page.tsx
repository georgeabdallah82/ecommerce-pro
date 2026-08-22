import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { ReviewsAdmin } from '@/components/admin-resource';
export default async function Reviews(){await requirePermission('reviews.view');return <ReviewsAdmin initial={await db.review.findMany({include:{product:true,user:true},orderBy:{createdAt:'desc'}})}/>} 

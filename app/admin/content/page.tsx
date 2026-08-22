import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { ContentAdmin } from '@/components/admin-resource';
export default async function Content(){await requirePermission('content.view');return <ContentAdmin initial={await db.homepageBlock.findMany({orderBy:{sortOrder:'asc'}})}/>} 

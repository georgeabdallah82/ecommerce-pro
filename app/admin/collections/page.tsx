import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { CollectionsAdmin } from '@/components/admin-resource';
export default async function Collections(){await requirePermission('collections.view');return <CollectionsAdmin initial={await db.collection.findMany({include:{_count:{select:{products:true}}},orderBy:{sortOrder:'asc'}})}/>} 

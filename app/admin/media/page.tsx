import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { MediaAdmin } from '@/components/admin-resource';
export default async function Media(){await requirePermission('media.view');return <MediaAdmin initial={await db.mediaAsset.findMany({orderBy:{createdAt:'desc'}})}/>} 

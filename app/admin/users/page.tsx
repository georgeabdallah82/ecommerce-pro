import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { UsersAdmin } from '@/components/admin-resource';
export default async function Users(){await requirePermission('users.view');return <UsersAdmin initial={await db.user.findMany({orderBy:{createdAt:'desc'}})}/>} 

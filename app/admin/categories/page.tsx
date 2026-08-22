import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { CategoriesAdmin } from '@/components/admin-resource';
export default async function Categories(){await requirePermission('categories.view');return <CategoriesAdmin initial={await db.category.findMany({include:{_count:{select:{products:true}}},orderBy:{sortOrder:'asc'}})}/>} 

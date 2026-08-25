import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import CategoriesAdminShopify from '@/components/categories-admin-shopify'

export default async function Categories(){
  await requirePermission('categories.view')
  const rows=await db.category.findMany({include:{_count:{select:{products:true}}},orderBy:[{sortOrder:'asc'},{name:'asc'}]})
  return <CategoriesAdminShopify initial={JSON.parse(JSON.stringify(rows))}/>
}

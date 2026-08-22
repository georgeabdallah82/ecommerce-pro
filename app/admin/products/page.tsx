import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductListAdmin from '@/components/product-list-admin'
export default async function Products(){await requirePermission('products.view');const rows=await db.product.findMany({include:{category:true,inventory:true,images:true},orderBy:{updatedAt:'desc'}});return <ProductListAdmin initial={JSON.parse(JSON.stringify(rows))}/>} 

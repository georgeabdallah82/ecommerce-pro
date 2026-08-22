import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/prisma'; import { InventoryAdmin } from '@/components/admin-resource';
export default async function Inventory(){await requirePermission('inventory.view');const rows=await db.inventoryItem.findMany({include:{product:true,variant:true},orderBy:{quantity:'asc'}});return <InventoryAdmin initial={rows}/>} 

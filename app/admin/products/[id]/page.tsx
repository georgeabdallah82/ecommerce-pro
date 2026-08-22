import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import ProductEditor from '@/components/product-editor'
export default async function ProductEdit({params}:{params:Promise<{id:string}>}){
  await requirePermission('products.view'); const {id}=await params
  const [p,categories,definitions]=await Promise.all([
    db.product.findUnique({where:{id},include:{category:true,images:{orderBy:{sortOrder:'asc'}},variants:{include:{inventory:true}},inventory:{where:{variantId:null}},tags:true,metafields:{include:{definition:true}}}}),
    db.category.findMany({orderBy:[{sortOrder:'asc'},{name:'asc'}]}),
    db.metafieldDefinition.findMany({where:{ownerType:'PRODUCT'},orderBy:[{namespace:'asc'},{key:'asc'}]})
  ])
  if(!p) return <div className="empty">Product not found.</div>
  return <ProductEditor initial={JSON.parse(JSON.stringify(p))} creating={false} categories={categories} definitions={JSON.parse(JSON.stringify(definitions))}/>
}

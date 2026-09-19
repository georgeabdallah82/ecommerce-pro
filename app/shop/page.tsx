import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import {ProductStatus} from '@prisma/client'
import {Footer} from '@/components/footer'
import AliExpressShop from '@/components/aliexpress-shop'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Shop({searchParams}:{searchParams:Promise<{q?:string;category?:string;min?:string;max?:string;sort?:string}>}){
  const sp=await searchParams
  const q=sp.q?.trim();const min=Number(sp.min);const max=Number(sp.max);const sort=sp.sort||'newest'
  const orderBy=sort==='price_asc'?{basePrice:'asc' as const}:sort==='price_desc'?{basePrice:'desc' as const}:{createdAt:'desc' as const}
  const priceFilter=(Number.isFinite(min)&&min>0)||(Number.isFinite(max)&&max>0)?{basePrice:{...(Number.isFinite(min)&&min>0?{gte:Math.trunc(min*100)}:{}),...(Number.isFinite(max)&&max>0?{lte:Math.trunc(max*100)}:{})}}:{}
  const searchFilter=q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{sku:{contains:q,mode:'insensitive' as const}},{description:{contains:q,mode:'insensitive' as const}}]}:{}
  const unpublishedIds=await getUnpublishedProductIds()
  const [{theme},rawProducts,categories]=await Promise.all([
    getThemeState(),
    db.product.findMany({where:{status:ProductStatus.ACTIVE,id:{notIn:unpublishedIds},...searchFilter,...(sp.category?{category:{slug:sp.category}}:{}),...priceFilter},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy}),
    db.category.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}})
  ])
  const products=await withProductStats(rawProducts)
  return <><AliExpressShop theme={theme} products={products} categories={categories} query={sp}/><Footer theme={theme}/></>
}

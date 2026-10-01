import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import {ProductStatus} from '@prisma/client'
import {Footer} from '@/components/footer'
import AliExpressShop from '@/components/aliexpress-shop'

export const dynamic='force-dynamic'
export const revalidate=0

// A product's real "starting price" is the cheapest of its variants' own price
// overrides (ProductVariant.price), not basePrice -- once a product has variants,
// basePrice is never actually charged (see components/storefront-sections.tsx /
// checkout), so filtering or sorting by basePrice alone could hide a product from
// a price range it's genuinely sellable in, or order results by a number nobody pays.
function effectivePriceCents(p:{basePrice:number;variants:{price:number|null}[]}){
  return p.variants.length?Math.min(...p.variants.map(v=>v.price??p.basePrice)):p.basePrice
}

// theme.editorTemplates.Collection is shared between /shop and
// /collections/[slug] (components/aliexpress-collection-detail.tsx), matching
// how their "Collection & shop pages" settings are already unified under one
// Theme tab category. main_collection_banner/main_collection_grid are
// structural placeholders for the untouched core rendered above, not real
// content here.
const COLLECTION_ZONE_EXCLUDE=new Set(['header','announcement','footer','main_collection_banner','main_collection_grid'])

export default async function Shop({searchParams}:{searchParams:Promise<{q?:string;collection?:string;min?:string;max?:string;sort?:string}>}){
  const sp=await searchParams
  const q=sp.q?.trim();const min=Number(sp.min);const max=Number(sp.max);const sort=sp.sort||'newest'
  const searchFilter=q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{sku:{contains:q,mode:'insensitive' as const}},{description:{contains:q,mode:'insensitive' as const}}]}:{}
  const unpublishedIds=await getUnpublishedProductIds()
  const [{theme},rawProducts,collections]=await Promise.all([
    getThemeState(),
    db.product.findMany({where:{status:ProductStatus.ACTIVE,id:{notIn:unpublishedIds},...searchFilter,...(sp.collection?{collections:{some:{collection:{slug:sp.collection}}}}:{})},include:{images:true,collections:{include:{collection:true}},variants:{select:{price:true}}}}),
    db.collection.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}})
  ])
  const hasMin=Number.isFinite(min)&&min>0;const hasMax=Number.isFinite(max)&&max>0
  const minCents=hasMin?Math.trunc(min*100):null;const maxCents=hasMax?Math.trunc(max*100):null
  let scoped=rawProducts.map(p=>({...p,effectivePrice:effectivePriceCents(p)}))
  if(hasMin)scoped=scoped.filter(p=>p.effectivePrice>=minCents!)
  if(hasMax)scoped=scoped.filter(p=>p.effectivePrice<=maxCents!)
  scoped=sort==='price_asc'?scoped.sort((a,b)=>a.effectivePrice-b.effectivePrice)
    :sort==='price_desc'?scoped.sort((a,b)=>b.effectivePrice-a.effectivePrice)
    :scoped.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
  const products=await withProductStats(scoped)
  const sections=(theme.editorTemplates?.Collection||[]).filter((s:any)=>s&&!COLLECTION_ZONE_EXCLUDE.has(s.type))
  return <><AliExpressShop theme={theme} products={products} collections={collections} query={sp} sections={sections}/><Footer theme={theme}/></>
}

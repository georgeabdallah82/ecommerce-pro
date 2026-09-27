import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import AliExpressHome from '@/components/aliexpress-home'
import {Footer} from '@/components/footer'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const hero=sections.find((s:any)=>s.type==='hero'&&s.enabled!==false&&s.settings?.enabled!==false)
  const categoryStrip=sections.find((s:any)=>s.type==='category_strip')
  const flashDeals=sections.find((s:any)=>s.type==='flash_deals')
  const collectionsSection=sections.find((s:any)=>s.type==='collection_grid')
  const newArrivalsSection=sections.find((s:any)=>s.type==='new_arrivals')
  const bestSellersSection=sections.find((s:any)=>s.type==='best_sellers')
  const unpublishedIds=await getUnpublishedProductIds()
  const [rawProducts,collections,iconCollections,contentBlocks]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE',id:{notIn:unpublishedIds}},include:{images:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:60}),
    db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:12,orderBy:{sortOrder:'asc'}}),
    db.collection.findMany({where:{isActive:true},take:12,orderBy:{sortOrder:'asc'}}),
    // Only 'announcement' and 'trust' are actually rendered -- see components/aliexpress-home.tsx
    // and app/admin/content/page.tsx's ContentAdminShopify, which restricts new blocks to these
    // two types for the same reason.
    db.homepageBlock.findMany({where:{isActive:true,type:{in:['announcement','trust']}},orderBy:{sortOrder:'asc'}}),
  ])
  const products=await withProductStats(rawProducts)
  const announcements=contentBlocks.filter((b:any)=>b.type==='announcement')
  const trustItems=contentBlocks.filter((b:any)=>b.type==='trust')
  return <><AliExpressHome theme={theme} hero={hero} products={products} collections={collections} iconCollections={iconCollections} announcements={announcements} trustItems={trustItems} categoryStrip={categoryStrip} flashDeals={flashDeals} collectionsSection={collectionsSection} newArrivalsSection={newArrivalsSection} bestSellersSection={bestSellersSection}/><Footer theme={theme}/></>
}

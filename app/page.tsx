import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import AliExpressHome from '@/components/aliexpress-home'
import {Footer} from '@/components/footer'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const hero=sections.find((s:any)=>s.type==='hero'&&s.enabled!==false&&s.settings?.enabled!==false)
  const [rawProducts,collections,categories]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE'},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:60}),
    db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:12,orderBy:{sortOrder:'asc'}}),
    db.category.findMany({where:{isActive:true,parentId:null},take:12,orderBy:{sortOrder:'asc'}}),
  ])
  const products=await withProductStats(rawProducts)
  return <><AliExpressHome theme={theme} hero={hero} products={products} collections={collections} categories={categories}/><Footer theme={theme}/></>
}

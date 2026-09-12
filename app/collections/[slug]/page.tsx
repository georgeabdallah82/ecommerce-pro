import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {notFound} from 'next/navigation'
import {Footer} from '@/components/footer'
import LiveStorefrontSections from '@/components/live-storefront-sections'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function CollectionPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params
  const {theme}=await getThemeState()
  const collection=await db.collection.findUnique({where:{slug},include:{products:{include:{product:{include:{images:true,category:true,collections:{include:{collection:true}}}}},orderBy:{sortOrder:'asc'}}}})
  if(!collection||!collection.isActive)notFound()
  const products=await withProductStats(collection.products.map(x=>x.product))
  const templates=Array.isArray(theme.editorTemplates?.Collection)&&theme.editorTemplates.Collection.length?theme.editorTemplates.Collection:[{id:'announcement',type:'announcement',enabled:true,settings:{text:'Free shipping on orders over $50',background:'primary'}},{id:'banner',type:'main_collection_banner',enabled:true,settings:{heading:collection.name,subheading:collection.description||''}},{id:'grid',type:'main_collection_grid',enabled:true,settings:{heading:'Products',limit:24,columns:4}},{id:'newsletter',type:'newsletter',enabled:true,settings:{}},{id:'footer',type:'footer',enabled:true,settings:{}}]
  const currentCollection={...collection,products:collection.products}
  const footerEnabled=templates.some((s:any)=>s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false)
  return <><LiveStorefrontSections theme={theme} sections={templates} products={products} collections={[collection]} currentCollection={currentCollection}/>{footerEnabled&&<Footer theme={theme}/>}</>
}

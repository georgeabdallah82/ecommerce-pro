import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {notFound} from 'next/navigation'
import {Footer} from '@/components/footer'
import StorefrontSections from '@/components/storefront-sections'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function ProductPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params
  const {theme}=await getThemeState()
  const product=await db.product.findUnique({where:{slug},include:{images:{orderBy:{sortOrder:'asc'}},category:true,variants:{include:{inventory:true}},reviews:{where:{approved:true},take:24,orderBy:{createdAt:'desc'},include:{user:{select:{name:true}}}},collections:{include:{collection:true}}}})
  if(!product||product.status!=='ACTIVE')return notFound()
  const related=product.category?await db.product.findMany({where:{status:'ACTIVE',categoryId:product.categoryId,id:{not:product.id}},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:24}):[]
  const templates=Array.isArray(theme.editorTemplates?.Product)&&theme.editorTemplates.Product.length?theme.editorTemplates.Product:[{id:'announcement',type:'announcement',enabled:true,settings:{text:'Free shipping on orders over $50',background:'primary'}},{id:'main_product',type:'main_product',enabled:true,settings:{}},{id:'product_recommendations',type:'product_recommendations',enabled:true,settings:{heading:'You may also like',limit:4,columns:4}},{id:'newsletter',type:'newsletter',enabled:true,settings:{}},{id:'footer',type:'footer',enabled:true,settings:{}}]
  const footerEnabled=templates.some((s:any)=>s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false)
  return <><StorefrontSections theme={theme} sections={templates} products={related} collections={[]} product={product}/>{footerEnabled&&<Footer/>}</>
}

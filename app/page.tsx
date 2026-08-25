import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import LiveStorefrontSections from '@/components/live-storefront-sections'
import {Footer} from '@/components/footer'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const [products,collections]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE'},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:32}),
    db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:32,orderBy:{sortOrder:'asc'}})
  ])
  const hasHomeTemplate=Object.prototype.hasOwnProperty.call(theme.editorTemplates || {}, 'Home page')
  const homeTemplates=hasHomeTemplate
    ? (Array.isArray(theme.editorTemplates['Home page']) ? theme.editorTemplates['Home page'] : [])
    : sections
  const footerEnabled=homeTemplates.some((s:any)=>s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false)
  return <><LiveStorefrontSections theme={theme} sections={homeTemplates} products={products} collections={collections}/>{footerEnabled&&<Footer/>}</>
}

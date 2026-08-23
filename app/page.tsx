import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import StorefrontSections from '@/components/storefront-sections'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const [products,collections]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE'},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:32}),
    db.collection.findMany({where:{isActive:true},take:16,orderBy:{sortOrder:'asc'}})
  ])
  const homeTemplates=Array.isArray(theme.editorTemplates?.['Home page'])?theme.editorTemplates['Home page']:sections
  return <StorefrontSections theme={theme} sections={homeTemplates} products={products} collections={collections} />
}

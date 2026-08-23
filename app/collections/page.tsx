import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {Footer} from '@/components/footer'
import StorefrontSections from '@/components/storefront-sections'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Collections(){
  const [{theme},collections]=await Promise.all([
    getThemeState(),
    db.collection.findMany({where:{isActive:true},include:{_count:{select:{products:true}},products:{select:{productId:true}}},orderBy:{sortOrder:'asc'}})
  ])
  const templates=Array.isArray(theme.editorTemplates?.Collections)&&theme.editorTemplates.Collections.length?theme.editorTemplates.Collections:[{id:'announcement',type:'announcement',enabled:true,settings:{text:'Free shipping on orders over $50',background:'primary'}},{id:'intro',type:'rich_text',enabled:true,settings:{eyebrow:'CURATED SHOPPING',heading:'Collections',text:'Browse the store by collection.'}},{id:'collections',type:'collection_grid',enabled:true,settings:{heading:'Shop by collection',limit:collections.length,columns:4}},{id:'footer',type:'footer',enabled:true,settings:{}}]
  const footerEnabled=templates.some((s:any)=>s.type==='footer'&&s.enabled!==false&&s.settings?.enabled!==false)
  return <><StorefrontSections theme={theme} sections={templates} products={[]} collections={collections}/>{footerEnabled&&<Footer/>}</>
}

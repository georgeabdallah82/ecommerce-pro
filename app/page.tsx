import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import StorefrontSections from '@/components/storefront-sections'
import {Footer} from '@/components/footer'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const unpublishedIds=await getUnpublishedProductIds()
  const [rawProducts,collections,contentBlocks]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE',id:{notIn:unpublishedIds}},include:{images:true,collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:60}),
    db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:12,orderBy:{sortOrder:'asc'}}),
    // Only 'announcement' and 'trust' are actually rendered -- see
    // app/admin/content/page.tsx's ContentAdminShopify, which restricts new
    // blocks to these two types for the same reason. This is a separate,
    // older content-block system from the theme editor's section engine
    // below, kept as its own render pass around it rather than merged in.
    db.homepageBlock.findMany({where:{isActive:true,type:{in:['announcement','trust']}},orderBy:{sortOrder:'asc'}}),
  ])
  const products=await withProductStats(rawProducts)
  const announcements=contentBlocks.filter((b:any)=>b.type==='announcement')
  const trustItems=contentBlocks.filter((b:any)=>b.type==='trust')
  return <div className="aliHome">
    {announcements.map(block=>{
      let text=block.title||''
      try{const parsed=JSON.parse(block.contentJson||'{}');if(parsed?.text)text=String(parsed.text)}catch{}
      return text?<div className="aliAnnouncementBar" key={block.id}>{text}</div>:null
    })}
    <StorefrontSections theme={theme} sections={sections} products={products} collections={collections}/>
    {trustItems.length>0&&(
      <section className="aliTrustStrip">
        <div className="aliContainer aliTrustRow">
          {trustItems.map(block=>(
            <div className="aliTrustItem" key={block.id}>
              <strong>{block.title||'Why shop with us'}</strong>
              {block.subtitle&&<span>{block.subtitle}</span>}
            </div>
          ))}
        </div>
      </section>
    )}
    <Footer theme={theme}/>
  </div>
}

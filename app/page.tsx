import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {withProductStats} from '@/lib/product-stats'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import StorefrontSections from '@/components/storefront-sections'
import {Footer} from '@/components/footer'
import type { Metadata } from 'next'
import { absoluteUrl, siteUrl } from '@/lib/seo'

export const dynamic='force-dynamic'
export const revalidate=0

export const metadata: Metadata = { alternates: { canonical: '/' } }

export default async function Home(){
  const {theme,sections}=await getThemeState()
  const unpublishedIds=await getUnpublishedProductIds()
  const [rawProducts,collections,contentBlocks]=await Promise.all([
    db.product.findMany({where:{status:'ACTIVE',id:{notIn:unpublishedIds}},include:{images:{orderBy:{sortOrder:'asc'}},collections:{include:{collection:true}}},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:60}),
    db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:12,orderBy:{sortOrder:'asc'}}),
    // Legacy: the announcement bar and trust strip used to live in these admin "Content"
    // rows. They are theme-studio sections now (announcement_strip / trust_strip); the
    // studio converts these rows into sections the first time it is opened and records
    // that in theme.legacyHomeBlocksMigrated, after which these rows are ignored -- so
    // deleting a strip in the studio really removes it. Until then (a store that hasn't
    // opened the new studio yet) the rows keep rendering exactly as before.
    theme.legacyHomeBlocksMigrated?Promise.resolve([]):db.homepageBlock.findMany({where:{isActive:true,type:{in:['announcement','trust']}},orderBy:{sortOrder:'asc'}}),
  ])
  const products=await withProductStats(rawProducts)
  const announcements=contentBlocks.filter((b:any)=>b.type==='announcement')
  const trustItems=contentBlocks.filter((b:any)=>b.type==='trust')
  // Tells Google the store's name and logo, and lets it show a search box for the store.
  const base=siteUrl()
  const structuredData=[
    {'@context':'https://schema.org','@type':'Organization',name:theme.brandName,url:base,logo:/^(https?:\/\/|\/)/.test(theme.logoUrl||'')?absoluteUrl(theme.logoUrl):undefined},
    {'@context':'https://schema.org','@type':'WebSite',name:theme.brandName,url:base,potentialAction:{'@type':'SearchAction',target:`${base}/shop?q={search_term_string}`,'query-input':'required name=search_term_string'}},
  ]
  return <div className="aliHome">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}}/>
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

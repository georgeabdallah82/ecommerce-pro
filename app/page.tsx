import {db} from '@/lib/prisma'
import { FlashSaleBanner, OccasionBanner } from '@/components/selling-client'
import {getThemeState} from '@/lib/theme'
import {translator} from '@/lib/i18n'
import {withProductStats} from '@/lib/product-stats'
import { CARD_STOCK_INCLUDE, withCardStock } from '@/lib/card-stock'
import {getUnpublishedProductIds} from '@/lib/sales-channels'
import {storefrontCached} from '@/lib/storefront-cache'
import StorefrontSections from '@/components/storefront-sections'
import ScrollReveal from '@/components/scroll-reveal'
import {Footer} from '@/components/footer'
import TrustIcon from '@/components/trust-icon'
import type { Metadata } from 'next'
import { absoluteUrl, siteUrl } from '@/lib/seo'

export const dynamic='force-dynamic'
export const revalidate=0

export const metadata: Metadata = { alternates: { canonical: '/' } }

export default async function Home(){
  const [{theme,sections,lang},unpublishedIds]=await Promise.all([getThemeState(),getUnpublishedProductIds()])
  const t=translator(lang)
  const [rawProducts,collections,contentBlocks]=await Promise.all([
    storefrontCached(`home-products:${unpublishedIds.join(',')}`,()=>db.product.findMany({where:{status:'ACTIVE',id:{notIn:unpublishedIds}},include:{images:{orderBy:{sortOrder:'asc'}},collections:{include:{collection:true}},...CARD_STOCK_INCLUDE},orderBy:[{featured:'desc'},{createdAt:'desc'}],take:60})),
    // The same active collections the theme editor previews and its pickers offer (lib/zone-data.ts). It took 12,
    // so a strip set to show more, or a collection picked beyond the first 12, was missing from the live page.
    storefrontCached('home-collections',()=>db.collection.findMany({where:{isActive:true},include:{products:{select:{productId:true}}},take:24,orderBy:{sortOrder:'asc'}})),
    // Legacy: the announcement bar and trust strip used to live in these admin "Content"
    // rows. They are theme-studio sections now (announcement_strip / trust_strip); the
    // studio converts these rows into sections the first time it is opened and records
    // that in theme.legacyHomeBlocksMigrated, after which these rows are ignored -- so
    // deleting a strip in the studio really removes it. Until then (a store that hasn't
    // opened the new studio yet) the rows keep rendering exactly as before.
    theme.legacyHomeBlocksMigrated?Promise.resolve([]):storefrontCached('home-legacy-blocks',()=>db.homepageBlock.findMany({where:{isActive:true,type:{in:['announcement','trust']}},orderBy:{sortOrder:'asc'}})),
  ])
  const products=await withProductStats(withCardStock(rawProducts))
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
    <main>
    {announcements.map(block=>{
      let text=block.title||''
      try{const parsed=JSON.parse(block.contentJson||'{}');if(parsed?.text)text=String(parsed.text)}catch{}
      return text?<div className="aliAnnouncementBar" key={block.id}>{text}</div>:null
    })}
    <FlashSaleBanner/>
    <OccasionBanner/>
    <StorefrontSections theme={theme} sections={sections} products={products} collections={collections}/>
    {theme.design==='market'&&<ScrollReveal/>}
    {trustItems.length>0&&(
      <section className="aliTrustStrip">
        <div className="aliContainer aliTrustRow">
          {trustItems.map(block=>(
            <div className="aliTrustItem" key={block.id}>
              <TrustIcon title={block.title} text={block.subtitle}/>
              <strong>{block.title||t('Why shop with us')}</strong>
              {block.subtitle&&<span>{block.subtitle}</span>}
            </div>
          ))}
        </div>
      </section>
    )}
    </main>
    <Footer theme={theme}/>
  </div>
}

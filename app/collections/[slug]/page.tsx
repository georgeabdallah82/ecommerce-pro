import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {notFound} from 'next/navigation'
import {ProductCard} from '@/components/product-card'
import {Footer} from '@/components/footer'
import Link from 'next/link'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function CollectionPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params
 const {theme}=await getThemeState()
 const c=await db.collection.findUnique({where:{slug},include:{products:{include:{product:{include:{images:true,category:true}}},orderBy:{sortOrder:'asc'}}}})
 if(!c||!c.isActive)notFound()
 const template=Array.isArray((theme as any).editorTemplates?.Collection)&&((theme as any).editorTemplates.Collection as any[]).length?(theme as any).editorTemplates.Collection as any[]:[{id:'announcement',type:'announcement',enabled:true,settings:{text:theme.announcement?.text||'Free shipping on orders over $50',background:'primary'}},{id:'main_collection',type:'main_collection',enabled:true,settings:{}},{id:'main_collection_grid',type:'main_collection_grid',enabled:true,settings:{}},{id:'newsletter',type:'newsletter',enabled:true,settings:{}},{id:'footer',type:'footer',enabled:true,settings:{}}]
 const products=c.products.map(x=>x.product)
 const banner=(sec:any)=><section className="section"><div className="container"><div className="collectionHero"><span className="muted">COLLECTION</span><h1 className="h2">{sec.settings?.heading||c.name}</h1><p className="body muted">{sec.settings?.subheading||c.description||''}</p></div></div></section>
 const productGrid=(sec:any)=><section className="section"><div className="container"><div className="collectionToolbar">{theme.collectionPage?.showFilters!==false&&<button className="btn secondary">Filter</button>}{theme.collectionPage?.showSort!==false&&<select className="input compact"><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option><option>Newest</option></select>}</div><div className="grid productGrid" style={{gridTemplateColumns:`repeat(${Math.min(Number(sec.settings?.columns||theme.collectionPage?.columns||4),6)},minmax(0,1fr))`}}>{products.slice(0,Number(sec.settings?.limit||24)).map(p=><ProductCard p={p} key={p.id}/>)}</div></div></section>
 const rich=(sec:any)=><section className="section"><div className="container"><span className="muted">{sec.settings?.eyebrow||'COLLECTION'}</span><h2 className="h2">{sec.settings?.heading||''}</h2><p className="body muted">{sec.settings?.text||''}</p></div></section>
 const newsletter=(sec:any)=><section className="section"><div className="container"><div className={`newsletterHome ${sec.settings?.background||'primary'}`}><h2 className="h2">{sec.settings?.heading||'Stay in the loop'}</h2><p className="muted">{sec.settings?.text||''}</p></div></div></section>
 const announcement=(sec:any)=><section key={sec.id} className="storeSection announcementSection" style={{padding:0,background:sec.settings?.background==='secondary'?theme.colors.secondary:theme.colors.primary,color:sec.settings?.textColor||'#fff'}}><div className="announcementBar"><div className="announcementInner container">{sec.settings?.text||'Free shipping on orders over $50'}</div></div></section>
 let footerRendered=false
 const rendered=template.filter((sec:any)=>sec.enabled!==false&&sec.settings?.enabled!==false).map((sec:any)=>{
  if(sec.type==='announcement')return announcement(sec)
  if(sec.type==='main_collection'||sec.type==='main_collection_banner')return <div key={sec.id}>{banner(sec)}</div>
  if(sec.type==='main_collection_grid'||sec.type==='collection_grid'||sec.type==='collection_carousel'||sec.type==='product_grid')return <div key={sec.id}>{productGrid(sec)}</div>
  if(sec.type==='rich_text')return <div key={sec.id}>{rich(sec)}</div>
  if(sec.type==='newsletter')return <div key={sec.id}>{newsletter(sec)}</div>
  if(sec.type==='footer'){footerRendered=true;return <Footer key={sec.id}/>}
  return null
 })
 return <>{rendered}{!footerRendered&&<Footer/>}</>
}

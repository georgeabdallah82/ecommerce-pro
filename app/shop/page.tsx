import {db} from '@/lib/prisma'
import {getThemeState} from '@/lib/theme'
import {ProductStatus} from '@prisma/client'
import {Footer} from '@/components/footer'
import StorefrontSections from '@/components/storefront-sections'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function Shop({searchParams}:{searchParams:Promise<{q?:string;category?:string;min?:string;max?:string;sort?:string}>}){
  const sp=await searchParams
  const q=sp.q?.trim()
  const min=Number(sp.min)
  const max=Number(sp.max)
  const sort=sp.sort||'newest'
  const orderBy=sort==='price_asc'?{basePrice:'asc' as const}:sort==='price_desc'?{basePrice:'desc' as const}:{createdAt:'desc' as const}
  const priceFilter=(Number.isFinite(min)&&min>0)||(Number.isFinite(max)&&max>0)?{basePrice:{...(Number.isFinite(min)&&min>0?{gte:Math.trunc(min*100)}:{}),...(Number.isFinite(max)&&max>0?{lte:Math.trunc(max*100)}:{})}}:{}
  const [themeState,products,categories]=await Promise.all([
    getThemeState(),
    db.product.findMany({where:{status:ProductStatus.ACTIVE,...(q?{OR:[{name:{contains:q}},{sku:{contains:q}},{description:{contains:q}}]}:{}),...(sp.category?{category:{slug:sp.category}}:{}),...priceFilter},include:{images:true,category:true,collections:{include:{collection:true}}},orderBy}),
    db.category.findMany({where:{isActive:true},orderBy:{sortOrder:'asc'}})
  ])
  const {theme}=themeState
  const templates=Array.isArray(theme.editorTemplates?.Products)&&theme.editorTemplates.Products.length?theme.editorTemplates.Products:[{id:'announcement',type:'announcement',enabled:true,settings:{text:'Free shipping on orders over $50',background:'primary'}},{id:'rich',type:'rich_text',enabled:true,settings:{eyebrow:'STORE',heading:'Shop',text:`${products.length} products` }},{id:'grid',type:'product_grid',enabled:true,settings:{heading:'All products',limit:products.length,columns:4}}]
  return <><div className="focalStorefrontFilterBar"><form className="focalContainer focalShopFilters"><input className="focalInput" name="q" placeholder="Search products…" defaultValue={q}/><select className="focalSelect" name="category" defaultValue={sp.category||''}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select><select className="focalSelect" name="sort" defaultValue={sort}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select><button className="focalButton primary" type="submit">Apply</button></form></div><StorefrontSections theme={theme} sections={templates} products={products} collections={[]} /><Footer/></>
}

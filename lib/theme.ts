import {db} from '@/lib/prisma'
import {parseJson} from '@/lib/utils'
import {defaultTheme,defaultSections,defaultNavigation} from './theme-defaults'
export type ThemeConfig=typeof defaultTheme
export {defaultTheme,defaultSections,defaultNavigation}

function deepMerge(base:any,raw:any){
  const out=structuredClone(base||{})
  for(const [k,v] of Object.entries(raw||{})){
    if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object') out[k]=deepMerge(out[k],v)
    else out[k]=v
  }
  return out
}

function normalizeSections(raw:any, fallback:any[]){
  const source=Array.isArray(raw)?raw:(Array.isArray(fallback)?fallback:[])
  return source.filter(Boolean).map((original:any)=>{
    const settings={...(original.settings||{})}
    if(original.type==='hero' && !settings.imageUrl) settings.imageUrl=settings.desktopImageUrl||settings.mobileImageUrl||''
    return {
      ...original,
      enabled: original.enabled===false || original.enabled==='false' || original.enabled===0 ? false : true,
      settings,
      blocks:Array.isArray(original.blocks)?original.blocks.map((b:any)=>({...b,settings:{...(b.settings||{})}})):[]
    }
  })
}

function headerFirst(list:any[]){
  const normalized=normalizeSections(list,[])
  const headers=normalized.filter((s:any)=>s.type==='header')
  const rest=normalized.filter((s:any)=>s.type!=='header')
  return headers.length?[headers[0],...rest]:rest
}

function movePrimarySectionFirst(list:any[],type:string){
  const normalized=headerFirst(list)
  const index=normalized.findIndex(s=>s.type===type)
  if(index<0)return normalized
  const primary=normalized[index]
  const rest=normalized.filter((_,i)=>i!==index)
  const insertAt=rest.findIndex(s=>s.type!=='announcement'&&s.type!=='header')
  rest.splice(insertAt<0?rest.length:insertAt,0,primary)
  return rest
}

function templateDefaults(type:string){
  const common={spacing:72,contentWidth:1180,animation:'fade-up'}
  const make=(id:string,sectionType:string,settings:any={})=>({id:`${id}-template-default`,type:sectionType,enabled:true,settings:{...common,...settings},blocks:[]})
  const announcement=()=>make('announcement','announcement',{text:'Free shipping on orders over $50',link:'',height:40})
  const header=()=>make('header','header',{sticky:true,transparent:false,transparentHome:false,showSearch:true,showAccount:true,showWishlist:false,showCart:true,logoWidth:160})
  const newsletter=()=>make('newsletter','newsletter',{heading:'Stay in the loop',text:'Get launches, drops and offers in your inbox.',buttonLabel:'Subscribe',background:'primary'})
  const footer=()=>make('footer','footer',{columns:4})
  if(type==='Product') return [announcement(),header(),make('main-product','main_product',{previewProductId:'',stickyAddToCart:true,showVendor:true,showReviews:true,showWishlist:true}),make('recommendations','product_recommendations',{heading:'You may also like',subheading:'Best sellers, new arrivals or a hand-picked edit.',limit:4,columns:4,showViewAll:true,collection:''}),newsletter(),footer()]
  if(type==='Collection') return [announcement(),header(),make('collection-banner','main_collection_banner',{heading:'Collection',subheading:'',imageUrl:''}),make('collection-products','main_collection_grid',{heading:'Products',limit:24,columns:4}),newsletter(),footer()]
  return []
}

function repairTemplate(key:string,value:any){
  const list=headerFirst(Array.isArray(value)?value:[])
  if(key==='Product' && !list.some((s:any)=>s.type==='main_product')) return templateDefaults('Product')
  if(key==='Collection' && !list.some((s:any)=>s.type==='main_collection_grid')) return templateDefaults('Collection')
  return list
}

export async function getThemeState(){
  const [themeSetting,sectionsSetting,navigationSetting]=await Promise.all([
    db.setting.findUnique({where:{key:'theme.config'}}),
    db.setting.findUnique({where:{key:'theme.sections'}}),
    db.setting.findUnique({where:{key:'navigation.main'}})
  ])

  const raw=parseJson<any>(themeSetting?.value,{})
  const theme=deepMerge(defaultTheme,raw)
  const sections=normalizeSections(parseJson<any[]>(sectionsSetting?.value,defaultSections),defaultSections)

  const editorTemplates=(theme.editorTemplates&&typeof theme.editorTemplates==='object')?structuredClone(theme.editorTemplates):{}
  editorTemplates['Home page']=headerFirst(sections)

  const migrationVersion=Number(theme.editorTemplateMigrations||0)
  if(migrationVersion<3){
    // Repair templates that were created with the wrong page schema. This is
    // intentionally conservative: once the required primary section exists,
    // the merchant's custom ordering is left untouched.
    editorTemplates.Product=repairTemplate('Product',editorTemplates.Product)
    editorTemplates.Collection=repairTemplate('Collection',editorTemplates.Collection)
    theme.editorTemplateMigrations=3
  }

  for(const [key,value] of Object.entries(editorTemplates)){
    if(key!=='Home page') editorTemplates[key]=headerFirst(value as any[])
  }
  theme.editorTemplates=editorTemplates

  return {theme,sections,navigation:parseJson<any[]>(navigationSetting?.value,defaultNavigation)}
}

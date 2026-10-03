import {cache} from 'react'
import {db} from '@/lib/prisma'
import {getStorefrontSettings} from '@/lib/storefront-settings'
import {normalizeNavUrl} from '@/lib/links'
import {parseJson} from '@/lib/utils'
import {defaultTheme,defaultSections,defaultNavigation} from './theme-defaults'
import { setThemeTemplates } from '@/lib/theme-templates'
import { switchToMarket, isMarket, MARKET_COLORS } from '@/lib/storefront-market'
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

// category_strip/flash_deals/new_arrivals/best_sellers are read directly off
// the Home page section list (see app/page.tsx) the same way hero already is,
// but any install whose theme.sections predates these types just won't have
// them -- append the missing ones from defaultSections so they show up as
// real, editable rows instead of requiring the admin to know to add them.
function ensureHomeExtras(list:any[]):any[]{
  const extraTypes=['category_strip','flash_deals','new_arrivals','best_sellers']
  const have=new Set(list.map((s:any)=>s.type))
  const missing=extraTypes.filter(t=>!have.has(t))
  if(!missing.length) return list
  const extras=missing.map(t=>defaultSections.find(s=>s.type===t)).filter(Boolean)
  return [...list,...extras]
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
  const footer=()=>make('footer','footer',{columns:4})
  // No product_recommendations/newsletter here (unlike a first draft of this
  // function): the real product/collection pages (components/aliexpress-
  // product.tsx, aliexpress-collection-detail.tsx, aliexpress-shop.tsx) each
  // already render their own "You may also like"-equivalent content and
  // never read editorTemplates.Product/.Collection for it, so seeding one
  // here would silently duplicate it the moment this page-specific zone
  // became live-rendered -- and a newsletter block newly appearing on every
  // product/collection page with no merchant action would be its own
  // unrequested surprise. Defaulting to just the structural placeholders
  // means this zone renders nothing extra until a merchant actively adds to
  // it, so activating it changes nothing visually on any existing store.
  if(type==='Product') return [announcement(),header(),make('main-product','main_product',{previewProductId:'',stickyAddToCart:true,showVendor:true,showReviews:true,showWishlist:true}),footer()]
  if(type==='Collection') return [announcement(),header(),make('collection-banner','main_collection_banner',{heading:'Collection',subheading:'',imageUrl:''}),make('collection-products','main_collection_grid',{heading:'Products',limit:24,columns:4}),footer()]
  return []
}

// An early draft of templateDefaults() seeded a "You may also like" (product_recommendations)
// and a newsletter section into the Product and Collection templates. Those pages already show
// their own related products, so the seeded copy rendered a second "You may also like" once the
// page zones went live. Only the seeded sections (their fixed ids) are dropped, for the store and
// the theme editor alike; anything the merchant added has its own id and stays.
const SEEDED_ZONE_IDS=new Set(['recommendations-template-default','newsletter-template-default'])
export function dropSeededZoneSections(editorTemplates:Record<string,any>){
  for(const key of ['Product','Collection']){
    if(Array.isArray(editorTemplates[key])) editorTemplates[key]=editorTemplates[key].filter((s:any)=>!SEEDED_ZONE_IDS.has(s?.id))
  }
  return editorTemplates
}

// The market storefront's first colour preset used yellow (#facc15) as the accent; the preset is
// now the logo's orange. Stores that still carry the old preset value (it was filled in by the
// one-time switch to the market storefront, not picked by the merchant) are shown the new one, in
// the store and the theme editor alike, so the next publish saves it. Any other accent is kept.
const OLD_PRESET_ACCENT='#facc15'
export function updatePresetAccent(theme:any){
  if(theme?.colors&&String(theme.colors.accent||'').toLowerCase()===OLD_PRESET_ACCENT) theme.colors={...theme.colors,accent:MARKET_COLORS.accent}
  return theme
}

function repairTemplate(key:string,value:any){
  const list=headerFirst(Array.isArray(value)?value:[])
  if(key==='Product' && !list.some((s:any)=>s.type==='main_product')) return templateDefaults('Product')
  if(key==='Collection' && !list.some((s:any)=>s.type==='main_collection_grid')) return templateDefaults('Collection')
  return list
}

// Storefront menus get absolute links (see lib/links.ts); the editor keeps what was typed.
const withAbsoluteUrls=(items:any[]):any[]=>Array.isArray(items)?items.map(item=>item&&typeof item==='object'?{...item,url:normalizeNavUrl(item.url),...(Array.isArray(item.children)?{children:withAbsoluteUrls(item.children)}:{})}:item):items
// Read once per page render: the layout, metadata and page all ask for the theme, and each
// read is a database round trip (React's cache() scopes this to a single request).
export const getThemeState=cache(loadThemeState)
async function loadThemeState(){
  const settings=await getStorefrontSettings()
  const themeSetting={value:settings.get('theme.config')},sectionsSetting={value:settings.get('theme.sections')},navigationSetting={value:settings.get('navigation.main')}

  const raw=parseJson<any>(themeSetting?.value,{})
  const merged=deepMerge(defaultTheme,raw)
  const storedSections=normalizeSections(parseJson<any[]>(sectionsSetting?.value,defaultSections),defaultSections)
  // A store still on the older storefront is shown the new one (until its next publish
  // saves it); the market homepage never gets the old AliExpress rows appended back.
  const switched=switchToMarket(merged,storedSections)
  const theme:any=updatePresetAccent(switched.theme)
  const sections=isMarket(theme)?normalizeSections(switched.sections,[]):ensureHomeExtras(storedSections)

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
  dropSeededZoneSections(editorTemplates)

  for(const [key,value] of Object.entries(editorTemplates)){
    if(key!=='Home page') editorTemplates[key]=headerFirst(value as any[])
  }
  // Server code reads every page template (product/collection/cart/custom page sections),
  // but the browser only needs each template's header + announcement settings (the header
  // component picks them by route). Pages pass `theme` into client components, so the full
  // templates were serialized into every page's HTML. They're kept server-side instead (read
  // them with themeTemplates(theme)); headerTemplates is the slim copy the browser gets.
  delete theme.editorTemplates
  setThemeTemplates(theme,editorTemplates)
  theme.headerTemplates=Object.fromEntries(Object.entries(editorTemplates).map(([key,list])=>[key,(Array.isArray(list)?list:[]).filter((section:any)=>section?.type==='header'||section?.type==='announcement')]))

  return {theme,sections,navigation:withAbsoluteUrls(parseJson<any[]>(navigationSetting?.value,defaultNavigation))}
}

// getThemeState() above always resolves the currently PUBLISHED theme --
// that's correct for the live storefront, which must never render an
// admin's unpublished edits. The editor itself needs the opposite: it
// should reopen showing whatever was last saved (draft or published),
// otherwise a saved-but-unpublished draft looks like it silently vanished
// on every page reload. This mirrors the draft-aware precedence that
// GET /api/admin/theme already applies when the editor polls for its own
// state client-side, so the editor's initial server-rendered load and its
// client-side refetches agree.
function parseSettingValue(value: string | null | undefined, fallback: any) { if (!value) return fallback; try { return JSON.parse(value) } catch { return fallback } }
function normalizeEditorSections(input: any[]): any[] { return (Array.isArray(input) ? input : defaultSections).filter(Boolean).map((s: any) => ({ ...s, type: s.type === 'image_banner' ? 'hero' : s.type, enabled: s.enabled !== false, settings: { ...(s.settings || {}) }, blocks: Array.isArray(s.blocks) ? s.blocks : [] })) }
function normalizeEditorTemplates(input: any): Record<string, any[]> { const source = input && typeof input === 'object' ? input : {}; const out: Record<string, any[]> = {}; for (const [key, value] of Object.entries(source)) out[key] = normalizeEditorSections(value as any[]); return out }
// defaultSections lists announcement before header; every rendered page
// (storefront and editor alike) expects header first. Reorder without
// re-running normalizeEditorSections -- the input here is already normalized.
function headerFirstEditor(list: any[]): any[] { const headers = list.filter((s: any) => s.type === 'header'); const rest = list.filter((s: any) => s.type !== 'header'); return headers.length ? [headers[0], ...rest] : rest }

export async function getThemeEditorState() {
  const [draft,published,publishedSections,draftSections,navigation,draftNavigation]=await Promise.all([
    db.setting.findUnique({where:{key:'theme.draft'}}), db.setting.findUnique({where:{key:'theme.config'}}),
    db.setting.findUnique({where:{key:'theme.sections'}}), db.setting.findUnique({where:{key:'theme.draft.sections'}}),
    db.setting.findUnique({where:{key:'navigation.main'}}), db.setting.findUnique({where:{key:'navigation.draft'}}),
  ])
  const publishedTheme=parseSettingValue(published?.value,defaultTheme)
  const storedTheme=parseSettingValue(draft?.value,publishedTheme)
  const publishedHome=headerFirstEditor(normalizeEditorSections(parseSettingValue(publishedSections?.value,defaultSections)))
  const storedHome=headerFirstEditor(normalizeEditorSections(parseSettingValue(draftSections?.value,publishedHome)))
  // Same one-time switch as the live store, so the studio opens on what customers see.
  const switched=switchToMarket(storedTheme,storedTheme?.editorTemplates?.['Home page']||storedHome)
  const rawTheme:any=updatePresetAccent(switched.theme)
  const home=switched.switched?headerFirstEditor(normalizeEditorSections(switched.sections)):(isMarket(rawTheme)?storedHome:ensureHomeExtras(storedHome))
  const editorTemplates=normalizeEditorTemplates(rawTheme.editorTemplates)
  if(switched.switched||!Object.prototype.hasOwnProperty.call(editorTemplates,'Home page')) editorTemplates['Home page']=home
  dropSeededZoneSections(editorTemplates)
  for(const key of Object.keys(editorTemplates)) editorTemplates[key]=headerFirstEditor(editorTemplates[key])
  const theme={...rawTheme,editorTemplates}
  return {theme,sections:home,editorTemplates,navigation:parseSettingValue(draftNavigation?.value,parseSettingValue(navigation?.value,defaultNavigation)),draft:Boolean(draft),publishedTheme}
}

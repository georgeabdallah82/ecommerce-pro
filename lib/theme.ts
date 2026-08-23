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

export async function getThemeState(){
  const [themeSetting,sectionsSetting,navigationSetting]=await Promise.all([
    db.setting.findUnique({where:{key:'theme.config'}}),
    db.setting.findUnique({where:{key:'theme.sections'}}),
    db.setting.findUnique({where:{key:'navigation.main'}})
  ])

  const raw=parseJson<any>(themeSetting?.value,{})
  const theme=deepMerge(defaultTheme,raw)
  const sections=normalizeSections(parseJson<any[]>(sectionsSetting?.value,defaultSections),defaultSections)

  theme.colors={
    ...theme.colors,
    primary:'#ff5a1f',secondary:'#fff0e8',announcementBg:'#ff5a1f',announcementText:'#ffffff',accent:'#e64a19',buttonText:'#ffffff',background:'#fffaf6',surface:'#ffffff',text:'#191512',muted:'#746b64',border:'#eaded4'
  }

  const editorTemplates=(theme.editorTemplates&&typeof theme.editorTemplates==='object')?structuredClone(theme.editorTemplates):{}
  editorTemplates['Home page']=headerFirst(sections)

  const migrationVersion=Number(theme.editorTemplateMigrations||0)
  if(migrationVersion<2){
    if(Array.isArray(editorTemplates.Product)) editorTemplates.Product=movePrimarySectionFirst(editorTemplates.Product,'main_product')
    if(Array.isArray(editorTemplates.Collection)){
      let collection=headerFirst(editorTemplates.Collection)
      const banner=collection.findIndex(s=>s.type==='main_collection_banner')
      const grid=collection.findIndex(s=>s.type==='main_collection_grid')
      if(banner>=0){const item=collection.splice(banner,1)[0];collection.splice(collection.findIndex(s=>s.type!=='announcement'&&s.type!=='header'),0,item)}
      if(grid>=0){const item=collection.splice(collection.findIndex(s=>s.type==='main_collection_grid'),1)[0];const idx=collection.findIndex(s=>s.type!=='announcement'&&s.type!=='header'&&s.type!=='main_collection_banner');collection.splice(idx<0?collection.length:idx,0,item)}
      editorTemplates.Collection=collection
    }
    theme.editorTemplateMigrations=2
  }

  for(const [key,value] of Object.entries(editorTemplates)){
    if(key!=='Home page') editorTemplates[key]=headerFirst(value as any[])
  }
  theme.editorTemplates=editorTemplates

  return {theme,sections,navigation:parseJson<any[]>(navigationSetting?.value,defaultNavigation)}
}

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
  return source.filter(Boolean).map((s:any)=>({
    ...s,
    enabled:s.enabled!==false,
    settings:{...(s.settings||{})},
    blocks:Array.isArray(s.blocks)?s.blocks.map((b:any)=>({
      ...b,
      settings:{...(b.settings||{})}
    })):[]
  }))
}

function headerFirst(list:any[]){
  const normalized=normalizeSections(list,[])
  const headers=normalized.filter((s:any)=>s.type==='header')
  const rest=normalized.filter((s:any)=>s.type!=='header')
  return headers.length?[headers[0],...rest]:rest
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
    primary:'#ff5a1f',
    secondary:'#fff0e8',
    announcementBg:'#ff5a1f',
    announcementText:'#ffffff',
    accent:'#e64a19',
    buttonText:'#ffffff',
    background:'#fffaf6',
    surface:'#ffffff',
    text:'#191512',
    muted:'#746b64',
    border:'#eaded4'
  }

  // Keep the editor and the live storefront on one source of truth.
  // The storefront header is global (StoreNav), so the editor keeps a Header
  // section at the top of each template while all other Home sections come
  // directly from theme.sections. Older saved editorTemplates are normalized
  // so stale copies cannot hide sections or reorder the preview incorrectly.
  const editorTemplates=(theme.editorTemplates&&typeof theme.editorTemplates==='object')
    ? structuredClone(theme.editorTemplates)
    : {}
  editorTemplates['Home page']=headerFirst(sections)
  for(const [key,value] of Object.entries(editorTemplates)){
    if(key!=='Home page') editorTemplates[key]=headerFirst(value as any[])
  }
  theme.editorTemplates=editorTemplates

  return {
    theme,
    sections,
    navigation:parseJson<any[]>(navigationSetting?.value,defaultNavigation)
  }
}
import {db} from '@/lib/prisma'
import {parseJson} from '@/lib/utils'
import {defaultTheme,defaultSections,defaultNavigation} from './theme-defaults'
export type ThemeConfig=typeof defaultTheme
export {defaultTheme,defaultSections,defaultNavigation}
function deepMerge(base:any,raw:any){const out=structuredClone(base||{});for(const [k,v] of Object.entries(raw||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object')out[k]=deepMerge(out[k],v);else out[k]=v}return out}
export async function getThemeState(){
  const [themeSetting,sectionsSetting,navigationSetting]=await Promise.all([
    db.setting.findUnique({where:{key:'theme.config'}}),
    db.setting.findUnique({where:{key:'theme.sections'}}),
    db.setting.findUnique({where:{key:'navigation.main'}})
  ])
  const raw=parseJson<any>(themeSetting?.value,{})
  const theme=deepMerge(defaultTheme,raw)
  // Keep the storefront's brand palette orange-forward. Existing saved theme data
  // may contain the old dark announcement/accent values, so normalize those too.
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
  return {
    theme,
    sections:parseJson<any[]>(sectionsSetting?.value,defaultSections),
    navigation:parseJson<any[]>(navigationSetting?.value,defaultNavigation)
  }
}

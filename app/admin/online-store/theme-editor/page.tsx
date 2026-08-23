import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ProThemeEditor from '@/components/pro-theme-editor'

export const dynamic='force-dynamic'
export const revalidate=0

function editorSections(source:any[]){
  return JSON.parse(JSON.stringify(source||[])).map((s:any)=>{
    const settings={...(s.settings||{})}
    if(s.type==='hero'){
      settings.imageUrl=settings.imageUrl||settings.desktopImageUrl||settings.mobileImageUrl||''
      settings.imageHeightMode=settings.imageHeightMode||((settings.heightMode==='fixed'||settings.heightMode==='custom')?'fixed':'adapt')
      settings.minHeight=Number(settings.minHeight||settings.customHeight||640)
    }
    return {...s,enabled:s.enabled!==false,settings,blocks:Array.isArray(s.blocks)?s.blocks:[]}
  })
}

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  const state=await getThemeState()
  const sections=editorSections(state.sections)
  const theme=JSON.parse(JSON.stringify(state.theme))
  // Home editor state is always bootstrapped from the same section data the
  // storefront renders, never from an older editor-only copy.
  theme.editorTemplates={
    ...(theme.editorTemplates||{}),
    'Home page':sections
  }
  return <ProThemeEditor initial={{theme,sections,navigation:JSON.parse(JSON.stringify(state.navigation))}}/>
}

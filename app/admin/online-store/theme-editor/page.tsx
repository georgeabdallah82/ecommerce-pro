import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ProThemeEditor from '@/components/pro-theme-editor'

export const dynamic='force-dynamic'
export const revalidate=0

function editorSections(source:any[]){
  return JSON.parse(JSON.stringify(source||[])).map((s:any)=>{
    const settings={...(s.settings||{})}
    if(s.type==='image_banner') s.type='hero'
    if(s.type==='hero'){
      settings.imageUrl=settings.imageUrl||settings.desktopImageUrl||settings.mobileImageUrl||''
      settings.imageHeightMode=settings.imageHeightMode||((settings.heightMode==='fixed'||settings.heightMode==='custom')?'fixed':'adapt')
      settings.minHeight=Number(settings.minHeight||settings.customHeight||640)
    }
    return {...s,enabled:s.enabled!==false,settings,blocks:Array.isArray(s.blocks)?s.blocks:[]}
  })
}

const previewFix=`
.pteHeroAdapt{min-height:420px !important;position:relative !important;overflow:hidden !important;background:#3b322d !important}
.pteHeroAdapt>img{display:block !important;width:100% !important;min-height:420px !important;height:auto !important;object-fit:cover !important;object-position:center !important}
.pteHeroAdapt>.pteHeroContent{position:absolute !important;inset:0 !important;z-index:3 !important}
.pteHeroAdapt>.pteHeroOverlay{position:absolute !important;inset:0 !important;z-index:2 !important}
`

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  const state=await getThemeState()
  const sections=editorSections(state.sections)
  const theme=JSON.parse(JSON.stringify(state.theme))
  theme.editorTemplates={...(theme.editorTemplates||{}),'Home page':sections}
  return <><style dangerouslySetInnerHTML={{__html:previewFix}}/><ProThemeEditor initial={{theme,sections,navigation:JSON.parse(JSON.stringify(state.navigation))}}/></>
}

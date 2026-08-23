import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ProThemeEditor from '@/components/pro-theme-editor'

export const dynamic='force-dynamic'
export const revalidate=0

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  const state=await getThemeState()
  const theme=JSON.parse(JSON.stringify(state.theme))
  const sections=JSON.parse(JSON.stringify(state.sections))
  const templates=(theme.editorTemplates&&typeof theme.editorTemplates==='object')?theme.editorTemplates:{'Home page':sections}
  templates['Home page']=sections
  return <ProThemeEditor initial={{theme:{...theme,editorTemplates:templates},sections,navigation:JSON.parse(JSON.stringify(state.navigation))}}/>
}

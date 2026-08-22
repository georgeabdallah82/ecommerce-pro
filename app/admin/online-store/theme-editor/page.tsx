import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ProThemeEditor from '@/components/pro-theme-editor'

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  const state=await getThemeState()
  const theme=JSON.parse(JSON.stringify(state.theme))
  // The Home template shown in the editor must always start from the exact
  // sections the storefront renders. Other templates keep their own drafts.
  theme.editorTemplates={
    ...(theme.editorTemplates||{}),
    'Home page':JSON.parse(JSON.stringify(state.sections))
  }
  return <ProThemeEditor initial={{theme,sections:JSON.parse(JSON.stringify(state.sections)),navigation:JSON.parse(JSON.stringify(state.navigation))}}/>
}

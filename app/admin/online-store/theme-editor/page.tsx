import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ProThemeEditor from '@/components/pro-theme-editor'

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  const state=await getThemeState()
  return <ProThemeEditor initial={JSON.parse(JSON.stringify(state))}/>
}

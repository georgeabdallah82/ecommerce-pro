import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ThemeEditor from '@/components/theme-editor'
export default async function ThemeEditorPage(){await requirePermission('content.view');return <ThemeEditor initial={JSON.parse(JSON.stringify(await getThemeState()))}/>} 

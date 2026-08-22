import {requirePermission} from '@/lib/auth'
import {getThemeState} from '@/lib/theme'
import ShopifyThemeEditor from '@/components/shopify-theme-editor'

export default async function ThemeEditorPage(){
  await requirePermission('content.view')
  return <ShopifyThemeEditor initial={JSON.parse(JSON.stringify(await getThemeState()))}/>
}

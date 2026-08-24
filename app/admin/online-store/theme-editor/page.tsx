import { requirePermission } from '@/lib/auth'
import { getThemeState } from '@/lib/theme'
import ShopifyThemeEditor from '@/components/shopify-theme-editor'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ThemeEditorPage() {
  await requirePermission('content.view')
  const state = await getThemeState()
  return (
    <ShopifyThemeEditor
      initial={{
        theme: JSON.parse(JSON.stringify(state.theme)),
        sections: JSON.parse(JSON.stringify(state.sections)),
        navigation: JSON.parse(JSON.stringify(state.navigation)),
      }}
    />
  )
}

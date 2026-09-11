import { requirePermission } from '@/lib/auth'
import { getThemeEditorState } from '@/lib/theme'
import ShopifyThemeEditorPage from '@/components/shopify-theme-editor-page'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ThemeEditorPage() {
  await requirePermission('content.view')
  const state = await getThemeEditorState()
  return (
    <ShopifyThemeEditorPage
      initial={{
        theme: JSON.parse(JSON.stringify(state.theme)),
        sections: JSON.parse(JSON.stringify(state.sections)),
        navigation: JSON.parse(JSON.stringify(state.navigation)),
        draft: state.draft,
      }}
    />
  )
}

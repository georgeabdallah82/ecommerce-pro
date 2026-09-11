import { requirePermission } from '@/lib/auth'
import ThemePreviewFrame from '@/components/theme-preview-frame'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Loaded only inside the theme editor's own iframe (see components/focal-theme-editor.tsx).
// Renders nothing from the database itself -- the parent editor posts the
// draft theme/sections/navigation/product data across via postMessage once
// this frame announces it's ready, so the preview always reflects unsaved
// changes instead of the last-published state.
export default async function ThemeEditorPreviewPage() {
  await requirePermission('content.view')
  return <ThemePreviewFrame />
}

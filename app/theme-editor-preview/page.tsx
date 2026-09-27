import { requirePermission } from '@/lib/auth'
import ThemePreviewFrame from '@/components/theme-preview-frame'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Loaded only inside the theme editor's own iframe (see components/theme-studio.tsx).
// Renders nothing from the database itself -- the parent editor posts the
// draft theme/sections/navigation/product data across via postMessage once
// this frame announces it's ready, so the preview always reflects unsaved
// changes instead of the last-published state.
//
// Deliberately NOT nested under app/admin/ -- every route under that directory
// renders through app/admin/layout.tsx, which wraps children in the full
// AdminNav sidebar/topbar shell unconditionally. This page used to live at
// app/admin/online-store/theme-editor/preview, so the iframe's own storefront
// preview was rendered *inside* a second, nested copy of the entire admin
// shell instead of showing the actual storefront -- the theme editor's "live
// preview" pane showed the admin dashboard chrome, not the page being edited.
// Living outside app/admin/ means this page only goes through the root
// app/layout.tsx (same as every real storefront page), which is what
// theme-preview-frame.tsx's own top comment already assumes. See also
// components/store-nav-runtime.tsx, which excludes this path the same way it
// excludes /admin/* so the root layout's own (published-theme) nav doesn't
// render a second time alongside this frame's own (draft-theme) nav.
export default async function ThemeEditorPreviewPage() {
  await requirePermission('content.view')
  return <ThemePreviewFrame />
}

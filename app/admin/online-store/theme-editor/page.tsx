import { requirePermission } from '@/lib/auth'
import { getThemeEditorState } from '@/lib/theme'
import { db } from '@/lib/prisma'
import ThemeStudioLoader from '@/components/theme-studio-loader'
import { loadZoneData } from '@/lib/zone-data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ThemeEditorPage({ searchParams }: { searchParams: Promise<{ page?: string; settings?: string }> }) {
  const { page: openPage, settings: openSettings } = await searchParams
  await requirePermission('content.view')
  const state = await getThemeEditorState()
  // Rows from the retired admin "Content" panel, handed to the studio once so it can turn
  // them into sections (see lib/home-strips.ts). Skipped after that has been saved.
  const legacyBlocks = state.theme?.legacyHomeBlocksMigrated
    ? []
    : await db.homepageBlock.findMany({ where: { isActive: true, type: { in: ['announcement', 'trust'] } }, orderBy: { sortOrder: 'asc' } })
  // The products and collections the pickers offer and the preview shows: the live
  // storefront's own queries, loaded here with the theme rather than by a second request
  // from the browser (those failed on the live site and left the pickers empty).
  let zone: { products: any[]; collections: any[] } | null = null
  let dataError = ''
  try {
    zone = await loadZoneData()
  } catch (error) {
    console.error('[theme-editor] loadZoneData failed', error)
    dataError = error instanceof Error ? error.message : 'Unable to load products and collections'
  }
  return (
    <ThemeStudioLoader
      initial={{
        theme: JSON.parse(JSON.stringify(state.theme)),
        sections: JSON.parse(JSON.stringify(state.sections)),
        navigation: JSON.parse(JSON.stringify(state.navigation)),
        draft: state.draft,
        legacyBlocks: JSON.parse(JSON.stringify(legacyBlocks)),
        openSettings: typeof openSettings === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(openSettings) ? openSettings : undefined,
        openPage: typeof openPage === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(openPage) ? openPage : undefined,
        products: zone ? JSON.parse(JSON.stringify(zone.products)) : undefined,
        collections: zone ? JSON.parse(JSON.stringify(zone.collections)) : undefined,
        dataError: dataError || undefined,
      }}
    />
  )
}

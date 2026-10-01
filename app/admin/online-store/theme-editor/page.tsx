import { requirePermission } from '@/lib/auth'
import { getThemeEditorState } from '@/lib/theme'
import { db } from '@/lib/prisma'
import ThemeStudio from '@/components/theme-studio'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ThemeEditorPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: openPage } = await searchParams
  await requirePermission('content.view')
  const state = await getThemeEditorState()
  // Rows from the retired admin "Content" panel, handed to the studio once so it can turn
  // them into sections (see lib/home-strips.ts). Skipped after that has been saved.
  const legacyBlocks = state.theme?.legacyHomeBlocksMigrated
    ? []
    : await db.homepageBlock.findMany({ where: { isActive: true, type: { in: ['announcement', 'trust'] } }, orderBy: { sortOrder: 'asc' } })
  return (
    <ThemeStudio
      initial={{
        theme: JSON.parse(JSON.stringify(state.theme)),
        sections: JSON.parse(JSON.stringify(state.sections)),
        navigation: JSON.parse(JSON.stringify(state.navigation)),
        draft: state.draft,
        legacyBlocks: JSON.parse(JSON.stringify(legacyBlocks)),
        openPage: typeof openPage === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(openPage) ? openPage : undefined,
      }}
    />
  )
}

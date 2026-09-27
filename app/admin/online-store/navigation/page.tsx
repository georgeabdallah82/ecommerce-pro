import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeEditorState } from '@/lib/theme'
import NavigationEditorPro from '@/components/navigation-editor-pro'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Uses getThemeEditorState() (draft-aware), not getThemeState() (published-only) --
// this page is an editor, same as app/admin/online-store/theme-editor/page.tsx, so
// it needs to reopen showing whatever was last saved (draft or published). Reading
// the published-only navigation here made a saved-but-unpublished draft look like it
// silently reverted on every reload, since Save always writes to navigation.draft.
export default async function Navigation(){
  await requirePermission('content.view')
  const [state, collections] = await Promise.all([
    getThemeEditorState(),
    db.collection.findMany({orderBy:{name:'asc'}}),
  ])
  return <NavigationEditorPro initial={JSON.parse(JSON.stringify(state.navigation))} collections={JSON.parse(JSON.stringify(collections))} initialDraft={state.draft}/>
}

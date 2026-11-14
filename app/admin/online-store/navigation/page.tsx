import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { getThemeEditorState } from '@/lib/theme'
import { isMarket } from '@/lib/storefront-market'
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
  // The store's custom pages, so a link can open one by name and a link to a draft is pointed out.
  const [state, collections, pages] = await Promise.all([
    getThemeEditorState(),
    db.collection.findMany({orderBy:{name:'asc'}}),
    db.page.findMany({orderBy:{title:'asc'},select:{title:true,handle:true,status:true},take:500}),
  ])
  return <NavigationEditorPro initial={JSON.parse(JSON.stringify(state.navigation))} collections={JSON.parse(JSON.stringify(collections))} pages={pages} initialDraft={state.draft} grouped={!isMarket(state.theme)}/>
}

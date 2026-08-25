import { requirePermission } from '@/lib/auth'
import CollectionEditorShopify from '@/components/collection-editor-shopify'

type Props = { params: Promise<{ id: string }> }

export default async function CollectionEdit({ params }: Props){
  await requirePermission('collections.view')
  const { id } = await params
  return <CollectionEditorShopify id={id}/>
}

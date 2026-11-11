import { requirePermission } from '@/lib/auth'
import CollectionEditorShopify from '@/components/collection-editor-shopify'
import { getStoreCurrency } from '@/lib/store-currency'

type Props = { params: Promise<{ id: string }> }

export default async function CollectionEdit({ params }: Props){
  await requirePermission('collections.view')
  const { id } = await params
  return <CollectionEditorShopify id={id} currency={await getStoreCurrency()}/>
}

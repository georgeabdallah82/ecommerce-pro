import { headers } from 'next/headers'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { bookmarkletCode } from '@/lib/import-bookmarklet'
import { getStoreIdentity } from '@/lib/store-identity'
import ProductImportAdmin from '@/components/product-import-admin'

export default async function ImportProduct() {
  await requirePermission('products.manage')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`
  const [store, currency] = await Promise.all([
    getStoreIdentity(),
    db.setting.findUnique({ where: { key: 'store.currency' } }).then(s => (s?.value || 'USD').toUpperCase()).catch(() => 'USD'),
  ])
  return <ProductImportAdmin bookmarklet={bookmarkletCode(origin)} storeName={store.name} currency={currency} />
}

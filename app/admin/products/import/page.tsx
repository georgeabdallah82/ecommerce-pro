import { headers } from 'next/headers'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import { bookmarkletCode } from '@/lib/import-bookmarklet'
import { getStoreIdentity } from '@/lib/store-identity'
import ProductImportTabs from '@/components/product-import-tabs'

// Products › Import: from a spreadsheet (CSV) or from another website. ?from=link opens the second.
export default async function ImportProduct({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePermission('products.manage')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`
  const [store, currency] = await Promise.all([
    getStoreIdentity(),
    db.setting.findUnique({ where: { key: 'store.currency' } }).then(s => (s?.value || 'USD').toUpperCase()).catch(() => 'USD'),
  ])
  const { from } = await searchParams
  return <ProductImportTabs bookmarklet={bookmarkletCode(origin)} storeName={store.name} currency={currency} initialTab={from === 'link' ? 'link' : 'spreadsheet'} />
}

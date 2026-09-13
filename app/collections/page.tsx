import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { Footer } from '@/components/footer'
import AliExpressCollections from '@/components/aliexpress-collections'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Collections() {
  const [{ theme }, collections] = await Promise.all([
    getThemeState(),
    db.collection.findMany({ where: { isActive: true }, include: { _count: { select: { products: true } } }, orderBy: { sortOrder: 'asc' } }),
  ])
  return (
    <>
      <AliExpressCollections collections={collections} />
      <Footer theme={theme} />
    </>
  )
}

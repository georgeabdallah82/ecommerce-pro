import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { Footer } from '@/components/footer'
import CustomPageView from '@/components/custom-page-view'
import { pageSections } from '@/lib/custom-pages'
import { withProductStats } from '@/lib/product-stats'
import { getUnpublishedProductIds } from '@/lib/sales-channels'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params
  const page = await db.page.findUnique({
    where: { handle },
    select: { title: true, seoTitle: true, seoDescription: true, status: true },
  })
  if (!page || page.status !== 'PUBLISHED') return {}
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || undefined,
  }
}

export default async function CustomPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const { theme } = await getThemeState()
  const page = await db.page.findUnique({ where: { handle } })
  if (!page || page.status !== 'PUBLISHED') notFound()

  // Sections built for this page in the theme editor (none = a plain title + body page, as before).
  const sections = pageSections(theme, page.id)
  let products: any[] = []
  let collections: any[] = []
  if (sections.length) {
    const unpublishedIds = await getUnpublishedProductIds()
    const [rawProducts, rawCollections] = await Promise.all([
      db.product.findMany({ where: { status: 'ACTIVE', id: { notIn: unpublishedIds } }, include: { images: true, collections: { include: { collection: true } } }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 60 }),
      db.collection.findMany({ where: { isActive: true }, include: { products: { select: { productId: true } } }, take: 24, orderBy: { sortOrder: 'asc' } }),
    ])
    products = await withProductStats(rawProducts)
    collections = rawCollections
  }

  return <>
    <CustomPageView theme={theme} page={page} sections={sections} products={products} collections={collections} />
    <Footer theme={theme} />
  </>
}

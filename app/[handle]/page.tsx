import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { Footer } from '@/components/footer'
import CustomPageView from '@/components/custom-page-view'
import { pageSections } from '@/lib/custom-pages'
import { loadZoneData } from '@/lib/zone-data'

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
  if (!page || page.status !== 'PUBLISHED') {
    // A menu link or shared link typed as "/personal-care" instead of "/collections/personal-care"
    // (or "/product/…") lands on the collection or product rather than "page not found".
    const [collection, product] = await Promise.all([
      db.collection.findUnique({ where: { slug: handle }, select: { slug: true } }).catch(() => null),
      db.product.findUnique({ where: { slug: handle }, select: { slug: true } }).catch(() => null),
    ])
    if (collection) redirect(`/collections/${encodeURIComponent(collection.slug)}`)
    if (product) redirect(`/product/${encodeURIComponent(product.slug)}`)
    notFound()
  }

  // Sections built for this page in the theme editor (none = a plain title + body page, as before).
  const sections = pageSections(theme, page.id)
  const { products, collections } = sections.length ? await loadZoneData() : { products: [] as any[], collections: [] as any[] }

  return <>
    <CustomPageView theme={theme} page={page} sections={sections} products={products} collections={collections} />
    <Footer theme={theme} />
  </>
}

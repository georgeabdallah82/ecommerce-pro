import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { parseJson } from '@/lib/utils'
import { Footer } from '@/components/footer'
import { BlogIndexView } from '@/components/blog-views'
import StorefrontSections from '@/components/storefront-sections'
import { BLOG_TEMPLATE_KEY, zoneSections } from '@/lib/custom-pages'
import { loadZoneData } from '@/lib/zone-data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = { title: 'Blog' }

function readTags(tagsJson: string | null) {
  const parsed = parseJson<unknown>(tagsJson, [])
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
}

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams
  const { theme } = await getThemeState()
  const rawPosts = await db.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, title: true, handle: true, excerpt: true, featuredImage: true, publishedAt: true, tagsJson: true },
  })
  const allPosts = rawPosts.map(post => ({ ...post, tags: readTags(post.tagsJson) }))
  const posts = tag ? allPosts.filter(post => post.tags.includes(tag)) : allPosts

  const sections = zoneSections(theme, BLOG_TEMPLATE_KEY)
  const { products, collections } = sections.length ? await loadZoneData() : { products: [] as any[], collections: [] as any[] }

  return <>
    <div className="focalStorefront">
      <BlogIndexView posts={posts} tag={tag} />
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={products} collections={collections} />}
    </div>
    <Footer theme={theme} />
  </>
}

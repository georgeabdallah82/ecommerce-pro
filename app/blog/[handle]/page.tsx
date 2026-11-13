import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { parseJson } from '@/lib/utils'
import { Footer } from '@/components/footer'
import StorefrontSections from '@/components/storefront-sections'
import { BLOG_TEMPLATE_KEY, zoneSections } from '@/lib/custom-pages'
import { loadZoneData } from '@/lib/zone-data'
import { sanitizeRichHtml } from '@/lib/sanitize-html'
import { translator } from '@/lib/i18n'
import { BlogCard, BlogTags, postDate } from '@/components/blog-views'

function readTags(tagsJson: string | null) {
  const parsed = parseJson<unknown>(tagsJson, [])
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params
  const post = await db.blogPost.findUnique({
    where: { handle },
    select: { title: true, seoTitle: true, seoDescription: true, excerpt: true, status: true },
  })
  if (!post || post.status !== 'PUBLISHED') return {}
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || undefined,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const { theme, lang } = await getThemeState()
  const t = translator(lang)
  const post = await db.blogPost.findUnique({ where: { handle } })
  if (!post || post.status !== 'PUBLISHED') notFound()
  const tags = readTags(post.tagsJson)
  const sections = zoneSections(theme, BLOG_TEMPLATE_KEY)
  // Up to three other posts, newest first, so a finished article leads somewhere.
  const [{ products, collections }, more] = await Promise.all([
    sections.length ? loadZoneData() : Promise.resolve({ products: [] as any[], collections: [] as any[] }),
    db.blogPost.findMany({
      where: { status: 'PUBLISHED', id: { not: post.id } },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { id: true, title: true, handle: true, excerpt: true, featuredImage: true, publishedAt: true, tagsJson: true },
    }).catch(() => []),
  ])

  return <>
    <main className="focalStorefront">
      <div className="aliContainer aliLegalPage">
        <Link href="/blog" className="textLink">{t('Back to blog')}</Link>
        <h1 dir="auto" style={{ marginTop: 16 }}>{post.title}</h1>
        {post.publishedAt && <p className="aliLegalUpdated">{postDate(post.publishedAt, lang)}</p>}
        {post.featuredImage && (
          <img src={post.featuredImage} alt="" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 14, margin: '0 0 24px', background: 'var(--focal-soft,#f1ebe6)' }} />
        )}
        {post.bodyHtml && <div dir="auto" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(post.bodyHtml) }} />}
        {tags.length > 0 && <div className="blogPostTags"><BlogTags tags={tags} /></div>}
      </div>
      {more.length > 0 && <section className="aliContainer blogMore" aria-labelledby="blog-more">
        <div className="aliSectionHead"><h2 id="blog-more">{t('More from the blog')}</h2></div>
        <div className="blogGrid">{more.map(item => <BlogCard key={item.id} post={{ ...item, tags: readTags(item.tagsJson) }} t={t} lang={lang} level={3} />)}</div>
      </section>}
      {sections.length > 0 && <StorefrontSections theme={theme} sections={sections} products={products} collections={collections} />}
    </main>
    <Footer theme={theme} />
  </>
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { parseJson } from '@/lib/utils'
import { Footer } from '@/components/footer'

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
  const { theme } = await getThemeState()
  const post = await db.blogPost.findUnique({ where: { handle } })
  if (!post || post.status !== 'PUBLISHED') notFound()
  const tags = readTags(post.tagsJson)

  return <>
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage">
        <Link href="/blog" className="textLink">← Back to blog</Link>
        <h1 style={{ marginTop: 16 }}>{post.title}</h1>
        {post.publishedAt && <p className="aliLegalUpdated">{post.publishedAt.toLocaleDateString()}</p>}
        {post.featuredImage && (
          <img src={post.featuredImage} alt="" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 14, margin: '0 0 24px', background: 'var(--focal-soft,#f1ebe6)' }} />
        )}
        {post.bodyHtml && <div dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />}
        {tags.length > 0 && (
          <span className="aliSpecList" style={{ marginTop: 24 }}>
            {tags.map(t => <Link className="aliSpecListItem" href={`/blog?tag=${encodeURIComponent(t)}`} key={t}>{t}</Link>)}
          </span>
        )}
      </div>
    </div>
    <Footer theme={theme} />
  </>
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { Footer } from '@/components/footer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = { title: 'Blog' }

export default async function BlogIndex() {
  const { theme } = await getThemeState()
  const posts = await db.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, title: true, handle: true, excerpt: true, featuredImage: true, publishedAt: true },
  })

  return <>
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage" style={{ maxWidth: 900 }}>
        <h1>Blog</h1>
        {!posts.length ? (
          <p className="aliEmptyState">No posts yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
            {posts.map(post => (
              <Link key={post.id} href={`/blog/${post.handle}`} style={{ display: 'flex', gap: 18, textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                {post.featuredImage && (
                  <img src={post.featuredImage} alt="" style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 10, flexShrink: 0, background: 'var(--focal-soft,#f1ebe6)' }} />
                )}
                <div>
                  <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>{post.title}</h2>
                  {post.publishedAt && <p style={{ fontSize: 13, color: 'var(--focal-muted,#746b64)', margin: '0 0 8px' }}>{post.publishedAt.toLocaleDateString()}</p>}
                  {post.excerpt && <p style={{ margin: 0 }}>{post.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    <Footer theme={theme} />
  </>
}

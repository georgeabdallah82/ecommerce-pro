import Link from 'next/link'

export type BlogListPost = { id: string; title: string; handle: string; excerpt?: string | null; featuredImage?: string | null; publishedAt?: Date | string | null; tags: string[] }

// The blog list and the article body, shared by the live /blog routes and the theme
// editor's preview so the preview shows the real markup.
export function BlogIndexView({ posts, tag }: { posts: BlogListPost[]; tag?: string }) {
  return (
    <div className="aliContainer aliLegalPage" style={{ maxWidth: 900 }}>
      <h1>Blog</h1>
      {tag && (
        <p style={{ fontSize: 14, color: 'var(--focal-muted,#746b64)' }}>
          Filtered by tag: <strong>{tag}</strong> · <Link href="/blog" className="textLink">Clear filter</Link>
        </p>
      )}
      {!posts.length ? (
        <p className="aliEmptyState">{tag ? `No posts tagged "${tag}".` : 'No posts yet.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
          {posts.map(post => (
            <div key={post.id} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
              {post.featuredImage && (
                <Link href={`/blog/${post.handle}`}>
                  <img src={post.featuredImage} alt="" style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 10, flexShrink: 0, background: 'var(--focal-soft,#f1ebe6)' }} />
                </Link>
              )}
              <div>
                <Link href={`/blog/${post.handle}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>{post.title}</h2>
                  {post.publishedAt && <p style={{ fontSize: 13, color: 'var(--focal-muted,#746b64)', margin: '0 0 8px' }}>{new Date(post.publishedAt).toLocaleDateString()}</p>}
                  {post.excerpt && <p style={{ margin: 0 }}>{post.excerpt}</p>}
                </Link>
                {post.tags.length > 0 && (
                  <span className="aliSpecList" style={{ marginTop: 8 }}>
                    {post.tags.map(t => <Link className="aliSpecListItem" href={`/blog?tag=${encodeURIComponent(t)}`} key={t}>{t}</Link>)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

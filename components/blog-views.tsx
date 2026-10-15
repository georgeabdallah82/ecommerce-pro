import Link from 'next/link'
import { dateLocale, type Lang, type T } from '@/lib/i18n'

export type BlogListPost = { id: string; title: string; handle: string; excerpt?: string | null; featuredImage?: string | null; publishedAt?: Date | string | null; tags: string[] }

// The blog list and the article body, shared by the live /blog routes and the theme
// editor's preview so the preview shows the real markup.
export function BlogIndexView({ posts, tag, t = text => text, lang = 'en' }: { posts: BlogListPost[]; tag?: string; t?: T; lang?: Lang }) {
  return (
    <div className="aliContainer aliLegalPage" style={{ maxWidth: 900 }}>
      <h1>{t('Blog')}</h1>
      {tag && (
        <p style={{ fontSize: 14, color: 'var(--focal-muted,#746b64)' }}>
          {t('Filtered by tag:')} <strong>{tag}</strong> · <Link href="/blog" className="textLink">{t('Clear filter')}</Link>
        </p>
      )}
      {!posts.length ? (
        <p className="aliEmptyState">{tag ? t('No posts tagged "{tag}".', { tag }) : t('No posts yet.')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
          {posts.map(post => (
            <div key={post.id} className="blogItem">
              {post.featuredImage && (
                // The title link below is the labelled one; this is the same link for the mouse.
                <Link href={`/blog/${post.handle}`} className="blogThumb" aria-hidden="true" tabIndex={-1}>
                  <img src={post.featuredImage} alt="" loading="lazy" />
                </Link>
              )}
              <div className="blogItemBody">
                <Link href={`/blog/${post.handle}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>{post.title}</h2>
                  {post.publishedAt && <p style={{ fontSize: 13, color: 'var(--focal-muted,#746b64)', margin: '0 0 8px' }}>{new Date(post.publishedAt).toLocaleDateString(dateLocale(lang))}</p>}
                  {post.excerpt && <p className="blogExcerpt" style={{ margin: 0 }}>{post.excerpt}</p>}
                </Link>
                {post.tags.length > 0 && (
                  <span className="aliSpecList" style={{ marginTop: 8 }}>
                    {post.tags.map(name => <Link className="aliSpecListItem" href={`/blog?tag=${encodeURIComponent(name)}`} key={name}>{name}</Link>)}
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

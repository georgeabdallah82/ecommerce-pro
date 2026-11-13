import Link from 'next/link'
import { ArrowRight, Newspaper } from 'lucide-react'
import { dateLocale, type Lang, type T } from '@/lib/i18n'

export type BlogListPost = { id: string; title: string; handle: string; excerpt?: string | null; featuredImage?: string | null; publishedAt?: Date | string | null; tags: string[] }

// The blog list and its cards, shared by the live /blog routes and the theme editor's preview so the preview shows
// the real markup. Styles: app/storefront-content.css.

// A post's date the way people write it ("November 11, 2026"); it showed as 11/11/2026.
export function postDate(value: Date | string | null | undefined, lang: Lang) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(dateLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' })
}

export function BlogTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return <span className="blogTags">{tags.map(name => <Link className="blogTag" href={`/blog?tag=${encodeURIComponent(name)}`} key={name}>{name}</Link>)}</span>
}

// One post: its photo (or the brand cream with an icon), date, title, a few lines of the excerpt and its tags. The
// title is the post's link; the photo and "Read the article" are the same link for the mouse, so they are skipped by
// the keyboard and screen readers.
export function BlogCard({ post, t, lang, featured = false, level = 2 }: { post: BlogListPost; t: T; lang: Lang; featured?: boolean; level?: 2 | 3 }) {
  const href = `/blog/${post.handle}`
  const Title = level === 3 ? 'h3' : 'h2'
  const date = postDate(post.publishedAt, lang)
  return (
    <article className={featured ? 'blogCard isFeatured' : 'blogCard'}>
      <Link href={href} className={post.featuredImage ? 'blogCardImage' : 'blogCardImage isEmpty'} aria-hidden="true" tabIndex={-1}>
        {post.featuredImage ? <img src={post.featuredImage} alt="" loading={featured ? 'eager' : 'lazy'} decoding="async" /> : <Newspaper size={30} />}
      </Link>
      <div className="blogCardBody">
        {date && <span className="blogCardDate">{date}</span>}
        <Title className="blogCardTitle"><Link href={href} dir="auto">{post.title}</Link></Title>
        {post.excerpt && <p className="blogCardExcerpt" dir="auto">{post.excerpt}</p>}
        <BlogTags tags={post.tags} />
        {featured && <Link className="blogCardMore" href={href} aria-hidden="true" tabIndex={-1}>{t('Read the article')}<ArrowRight size={16} /></Link>}
      </div>
    </article>
  )
}

// The newest post leads as a wide card; the rest follow in a grid. It was a list of small thumbnails.
export function BlogIndexView({ posts, tag, t = text => text, lang = 'en' }: { posts: BlogListPost[]; tag?: string; t?: T; lang?: Lang }) {
  const [first, ...rest] = posts
  return (
    <div className="aliContainer blogIndex">
      <h1 className="aliShopTitle">{t('Blog')}</h1>
      {tag && <p className="blogFilter">{t('Filtered by tag:')} <strong>{tag}</strong> · <Link href="/blog" className="textLink">{t('Clear filter')}</Link></p>}
      {!first ? (
        <section className="blogEmpty" role="status">
          <span className="blogEmptyIcon" aria-hidden="true"><Newspaper size={26} /></span>
          <h2>{tag ? t('No posts tagged "{tag}".', { tag }) : t('No posts yet.')}</h2>
          <Link className="focalButton primary" href={tag ? '/blog' : '/shop'}>{tag ? t('Clear filter') : t('Shop products')}</Link>
        </section>
      ) : <>
        <BlogCard post={first} t={t} lang={lang} featured />
        {rest.length > 0 && <div className="blogGrid">{rest.map(post => <BlogCard key={post.id} post={post} t={t} lang={lang} />)}</div>}
      </>}
    </div>
  )
}

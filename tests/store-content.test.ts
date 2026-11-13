import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'
import { postDate } from '../components/blog-views'

// Content pages (docs/store-content-2026-11.md): the blog and the live delivery tracking page.

const read = (path: string) => readFileSync(path, 'utf8')

test('a post\'s date reads the way people write it, and a missing or bad date shows nothing', () => {
  assert.equal(postDate(new Date('2026-11-11T10:00:00Z'), 'en'), 'November 11, 2026')
  assert.equal(postDate('2026-11-04T10:00:00Z', 'en'), 'November 4, 2026')
  assert.equal(postDate(null, 'en'), '')
  assert.equal(postDate('not a date', 'en'), '')
  assert.ok(postDate(new Date('2026-11-11T10:00:00Z'), 'ar').length > 0)
})

test('the blog leads with its newest post and shows the rest as cards', () => {
  const views = read('components/blog-views.tsx')
  assert.match(views, /const \[first, \.\.\.rest\] = posts/)
  assert.match(views, /<BlogCard post=\{first\} t=\{t\} lang=\{lang\} featured \/>/)
  assert.match(views, /\{rest\.length > 0 && <div className="blogGrid">\{rest\.map\(post => <BlogCard key=\{post\.id\} post=\{post\} t=\{t\} lang=\{lang\} \/>\)\}<\/div>\}/)
  // The title is the one link for the keyboard; the photo and "Read the article" repeat it for the mouse.
  assert.match(views, /<Link href=\{href\} className=\{post\.featuredImage \? 'blogCardImage' : 'blogCardImage isEmpty'\} aria-hidden="true" tabIndex=\{-1\}>/)
  assert.match(views, /<Title className="blogCardTitle"><Link href=\{href\} dir="auto">\{post\.title\}<\/Link><\/Title>/)
  assert.match(views, /<Link className="blogCardMore" href=\{href\} aria-hidden="true" tabIndex=\{-1\}>/)
  // No post, or none with that tag: a card with the way out.
  assert.match(views, /<section className="blogEmpty" role="status">/)
  assert.match(views, /<h1 className="aliShopTitle">\{t\('Blog'\)\}<\/h1>/)
  for (const text of ['Read the article', 'More from the blog']) assert.ok(AR[text], text)
  // The theme editor's preview shows the same list.
  assert.match(read('components/theme-preview-frame.tsx'), /<BlogIndexView posts=\{view\.blogPosts\.map/)
  // The old list's thumbnail styles went with it.
  assert.doesNotMatch(read('app/storefront-market.css'), /\.blogItem|\.blogThumb|\.blogExcerpt/)
})

test('an article ends with up to three more posts, under their own heading', () => {
  const post = read('app/blog/[handle]/page.tsx')
  assert.match(post, /where: \{ status: 'PUBLISHED', id: \{ not: post\.id \} \},\n\s+orderBy: \{ publishedAt: 'desc' \},\n\s+take: 3,/)
  assert.match(post, /<div className="aliSectionHead"><h2 id="blog-more">\{t\('More from the blog'\)\}<\/h2><\/div>/)
  assert.match(post, /<BlogCard key=\{item\.id\} post=\{\{ \.\.\.item, tags: readTags\(item\.tagsJson\) \}\} t=\{t\} lang=\{lang\} level=\{3\} \/>/, 'h3 under that h2')
  assert.match(post, /<p className="aliLegalUpdated">\{postDate\(post\.publishedAt, lang\)\}<\/p>/)
  assert.doesNotMatch(post, /aliSpecListItem/, 'tags are the blog chips')
})

test('the delivery tracking page: spaced cards, a heading, the status in words and colour, and a way back for guests', () => {
  const map = read('components/delivery-tracking-map.tsx')
  assert.doesNotMatch(map, /space-y-4/, 'a spacing class the store does not have')
  assert.match(map, /<div className="trackPage">/)
  assert.match(map, /<h1 className="trackTitle">/)
  assert.match(map, /<span className="pill" data-status=\{tracking\.status\}><Truck size=\{14\} aria-hidden="true" \/> \{statusLabel\(t, tracking\.status\)\}<\/span>/)
  assert.doesNotMatch(map, /function statusLabel/, 'the shared, translated labels (lib/i18n.ts)')
  assert.match(map, /toLocaleString\(dateLocale\(lang\), \{ dateStyle: 'medium', timeStyle: 'short' \}\)/)
  // Refresh runs the same check as the timer instead of reloading the page.
  assert.doesNotMatch(map, /location\.reload\(\)/)
  assert.match(map, /onClick=\{\(\) => setTick\(n => n \+ 1\)\}/)
  assert.match(map, /\}, \[token, tick\]\)/)
  const page = read('app/track/[token]/page.tsx')
  assert.match(page, /const back = user \? \{ href: '\/account', label: t\('Back to account'\) \} : \{ href: '\/shop', label: t\('Continue shopping'\) \}/)
  const css = read('app/storefront-content.css')
  assert.match(css, /html body\.mk \.trackPage \{ display: grid; gap: 16px; \}/)
  assert.match(css, /html body\.mk \.trackHead \.pill \{ display: inline-flex; align-items: center; gap: 6px; flex: none; \}/)
})

test('blog tags and links on their own line are 44 px to tap on touch screens', () => {
  const css = read('app/storefront-content.css')
  assert.match(css, /@media \(pointer: coarse\) \{ html body\.mk \.blogTag \{ min-height: 44px; padding: 0 14px; \} \}/)
  assert.match(css, /@media \(pointer: coarse\) \{ html body\.mk \.blogCardMore \{ min-height: 44px; \} \}/)
  assert.match(css, /html body\.mk \.aliLegalPage > a\.textLink:first-child \{ display: inline-flex; align-items: center; min-height: 44px; \}/)
})

test('the content styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-content.css'") > layout.indexOf("import './storefront-details.css'"))
})

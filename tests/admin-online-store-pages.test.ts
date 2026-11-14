import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RESERVED_HANDLES } from '@/lib/reserved-handles'
import { STORE_PAGE_PATHS, WORKING_PATHS, cleanFromPath, cleanToPath, redirectProblem } from '@/lib/redirects'
import { withTyped } from '@/lib/tag-input'
import { STORE_LINKS, describeMenuItem, linkProblem, pageLinks } from '@/lib/menu-editor'
import { readinessChecks } from '@/lib/theme-review'
import { setupItems, type OverviewFacts } from '@/lib/online-store-overview'

// Admin > Online store > Pages, Blog, URL redirects, Navigation and Policies (docs/admin-online-store-pages-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const pages = read('components/pages-admin.tsx')
const blog = read('components/blog-posts-admin.tsx')
const redirects = read('components/redirects-admin.tsx')
const dialog = read('components/admin-form-dialog.tsx')
const menu = read('components/navigation-editor-pro.tsx')
const policies = read('components/policies-admin.tsx')

test('a redirect\'s old address is saved as the path a visitor arrives at', () => {
  assert.equal(cleanFromPath('old-page/'), '/old-page')
  assert.equal(cleanFromPath('https://shop.example.com/old-page?ref=ad#top'), '/old-page')
  assert.equal(cleanFromPath('/old-page?ref=ad'), '/old-page')
  assert.equal(cleanFromPath('//old//'), '/old')
  assert.equal(cleanToPath('new-page'), '/new-page')
  assert.equal(cleanToPath('/shop?sort=newest'), '/shop?sort=newest')
  assert.equal(cleanToPath(' https://example.com/x '), 'https://example.com/x')
  assert.equal(cleanToPath(''), '')
})

test('redirects that would break the store, hide its pages or go round in a circle are refused', () => {
  assert.equal(redirectProblem('/old', '/new', []), null)
  assert.equal(redirectProblem('/', '/shop', []), 'A source path other than / is required')
  assert.match(String(redirectProblem('/checkout', '/shop', [])), /reserved/)
  assert.match(String(redirectProblem('/account/orders', '/shop', [])), /reserved/)
  assert.match(String(redirectProblem('/admin/x', '/shop', [])), /reserved/)
  assert.equal(redirectProblem('/shop', '/collections', []), '/shop is a page of your store. A redirect from it would hide that page from everyone.')
  // Under the store's pages is fine: a retired collection, post or product.
  assert.equal(redirectProblem('/collections/old-sale', '/collections/sale', []), null)
  assert.equal(redirectProblem('/blog/old-post', '/blog/new-post', []), null)
  assert.equal(redirectProblem('/old', '/old?x=1', []), 'The source and destination cannot be the same')
  const rules = [{ id: 'b', fromPath: '/b', toPath: '/c' }, { id: 'c', fromPath: '/c', toPath: '/a?from=c' }]
  assert.equal(redirectProblem('/a', '/b', rules), 'This would send visitors in a circle: /b already leads back to /a.')
  assert.equal(redirectProblem('/a', '/b', [{ id: 'b', fromPath: '/b', toPath: 'https://elsewhere.example' }]), null)
  // Editing a redirect leaves itself out of the circle check.
  assert.equal(redirectProblem('/b', '/d', rules, 'b'), null)
  // Every top-level route is either one that keeps the store working or one of its pages (or never visited).
  for (const handle of RESERVED_HANDLES) {
    const path = `/${handle}`
    if (['app'].includes(handle)) continue
    assert.ok(WORKING_PATHS.includes(path) || STORE_PAGE_PATHS.includes(path), `${path} is classified`)
  }
})

test('the redirects API uses those rules, and a moved page can leave a redirect behind', () => {
  const api = read('app/api/admin/redirects/route.ts')
  assert.match(api, /const error = redirectProblem\(fromPath, toPath, await others\(\)\)/)
  assert.match(api, /const error = redirectProblem\(fromPath, toPath, await others\(\), id\)/)
  const moves = read('lib/redirect-moves.ts')
  assert.match(moves, /await db\.redirect\.deleteMany\(\{ where: \{ fromPath: to \} \}\)/)
  assert.match(moves, /if \(redirectProblem\(from, to, others, existing\?\.id\)\) return false/)
  assert.match(read('app/api/admin/pages/route.ts'), /moved && b\.redirectFromOld === true \? await redirectMovedPage\(`\/\$\{existing\.handle\}`, `\/\$\{data\.handle\}`\) : false/)
  assert.match(read('app/api/admin/blog-posts/route.ts'), /moved && b\.redirectFromOld === true \? await redirectMovedPage\(`\/blog\/\$\{existing\.handle\}`, `\/blog\/\$\{data\.handle\}`\) : false/)
  // Only a published page's old address was ever visited.
  assert.match(read('app/api/admin/pages/route.ts'), /const moved = typeof data\.handle === 'string' && data\.handle !== existing\.handle && existing\.status === 'PUBLISHED'/)
})

test('tags still typed when a post is saved are kept', () => {
  assert.deepEqual(withTyped(['news'], 'tips'), ['news', 'tips'])
  assert.deepEqual(withTyped(['news'], ' tips, news ,, how-to '), ['news', 'tips', 'how-to'])
  assert.deepEqual(withTyped([], '   '), [])
  assert.match(blog, /const body = \{ \.\.\.form, handle, tags: withTyped\(form\.tags, typedTag\) \}/)
  assert.match(blog, /aria-label=\{`Remove the tag \$\{t\}`\}/)
})

test('the add and edit dialogs are dialogs, and say why a save failed inside them', () => {
  assert.match(dialog, /useModalFocus\(ref, open, \(\) => \{ if \(!busy\) onClose\(\) \}\)/)
  assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby=\{`\$\{id\}-title`\}/)
  assert.match(dialog, /aria-label="Close"/)
  assert.match(dialog, /role="alert">\{error\}/)
  for (const [name, source] of [['pages', pages], ['blog', blog], ['redirects', redirects]] as const) {
    assert.match(source, /<AdminFormDialog open=\{!!dialog\}/, name)
    assert.match(source, /<DialogError error=\{formError\} \/>/, name)
    assert.match(source, /setFormError\(e instanceof Error \? e\.message/, name)
    assert.match(source, /data-autofocus/, name)
    assert.match(source, /aria-label="Search (pages|posts|redirects)"/, name)
    assert.match(source, /aria-label="Clear search"/, name)
    assert.match(source, /<th><span className=\{s\.srOnly\}>Actions<\/span><\/th>/, name)
    assert.match(source, /<AdminScrollArea label=/, name)
    assert.match(source, /<h2 className=\{s\.emptyTitle\}>/, name)
    assert.doesNotMatch(source, /yourstore\.com|<h3>/, name)
  }
  assert.match(read('components/admin-scroll-area.tsx'), /tabIndex=\{scrolls \? 0 : undefined\}/)
  // The hidden "Actions" column name stays inside the scroll box (it stretched the page sideways on a phone).
  assert.match(read('components/admin-content-editors.module.css'), /\.tableRegion \{ position: relative; \}/)
})

test('pages and posts are written in the text editor, show their address and can keep the old one working', () => {
  assert.match(pages, /<RichTextEditor key=\{dialog\?\.opened\} value=\{form\.bodyHtml\} onChange=\{html => set\(\{ bodyHtml: html \}\)\} minHeight=\{200\} label="Page content" \/>/)
  assert.match(blog, /label="Post content"/)
  assert.match(pages, /The page is at <strong>\{host\}\/\{handle\}<\/strong>/)
  assert.match(blog, /The post is at <strong>\{host\}\/blog\/\{handle\}<\/strong>/)
  assert.match(pages, /RESERVED_HANDLES\.has\(handle\)/)
  assert.match(pages, /redirectFromOld: moving && redirectOld/)
  assert.match(blog, /redirectFromOld: moving && redirectOld/)
  // The text editor sits inside these forms, so its link bar is not a form of its own.
  const rte = read('components/rich-text-editor.tsx')
  assert.doesNotMatch(rte, /<form |<\/form>/)
  assert.match(rte, /aria-label=\{label\}/)
  // The featured image can come from Files; the picker is outside the form (its buttons would submit the post).
  assert.ok(blog.indexOf('</form>') < blog.indexOf('<MediaPicker open={picking}'))
  for (const file of ['app/admin/online-store/pages/page.tsx', 'app/admin/online-store/blog/page.tsx', 'app/admin/online-store/redirects/page.tsx']) {
    assert.match(read(file), /host=\{siteUrl\(\)\.replace\(\/\^https\?:\\\/\\\/\/, ''\)\}/, file)
  }
})

test('Pages, Blog and URL redirects are in the sidebar, so their tab titles and the admin search are right', () => {
  const layout = read('app/admin/layout.tsx')
  assert.match(layout, /\{ href: '\/admin\/online-store\/pages', label: 'Pages', permission: 'content\.view', icon: 'pages', more: true \}/)
  assert.match(layout, /\{ href: '\/admin\/online-store\/blog', label: 'Blog', permission: 'content\.view', icon: 'blog', more: true \}/)
  assert.match(layout, /\{ href: '\/admin\/online-store\/redirects', label: 'URL redirects', permission: 'content\.view', icon: 'redirects', more: true \}/)
  assert.match(read('components/admin-nav.tsx'), /pages: FileStack, blog: Newspaper, redirects: Route,/)
})

test('menu links: a page on the store by name, and links that would let visitors down', () => {
  const custom = [{ title: 'About us', handle: 'about-us', status: 'PUBLISHED' }, { title: 'FAQ', handle: 'faq', status: 'DRAFT' }]
  assert.equal(linkProblem('/#about'), 'Opens the top of your homepage: there is no “#about” section on it')
  assert.equal(linkProblem('#about'), 'Opens the top of your homepage: there is no “#about” section on it')
  assert.equal(linkProblem('/#main-content'), null)
  assert.equal(linkProblem('/pages/about-us'), 'Pages are at /about-us, not /pages/about-us: this address shows “page not found”')
  assert.equal(linkProblem('/faq', custom), 'Goes to “FAQ”, which is a draft: visitors see “page not found”')
  for (const ok of ['/about-us', '/shop', '/collections/sale', 'https://instagram.com/x', 'mailto:hi@example.com', '#', '']) assert.equal(linkProblem(ok, custom), null, ok)
  const links = pageLinks(custom)
  assert.deepEqual(links.slice(0, 2).map(l => l.path), ['/', '/shop'])
  assert.deepEqual(links.filter(l => l.custom).map(l => [l.path, l.label]), [['/about-us', 'About us'], ['/faq', 'FAQ (draft)']])
  assert.equal(STORE_LINKS.length, 13)
  assert.equal(describeMenuItem({ id: 'a', label: 'About', type: 'custom', url: '/about-us' }, [], 0, custom), 'Page: About us')
  assert.equal(describeMenuItem({ id: 'a', label: 'Shop', type: 'custom', url: '/shop' }, [], 0, custom), 'Page: All products')
  assert.equal(describeMenuItem({ id: 'a', label: 'X', type: 'custom', url: '/x' }, [], 0, custom), '/x')
  // In the editor: the choice, the example address, and the same checks in "Needs attention".
  assert.match(menu, /<option value="page">A page on your store<\/option>/)
  assert.match(menu, /placeholder="\/about-us or https:\/\/…"/)
  assert.doesNotMatch(menu, /\/pages\/about-us/)
  assert.match(menu, /const link = item\.type !== 'collection' \? linkProblem\(item\.url, pages\) : null/)
  assert.match(read('app/admin/online-store/navigation/page.tsx'), /db\.page\.findMany\(\{orderBy:\{title:'asc'\},select:\{title:true,handle:true,status:true\},take:500\}\)/)
})

test('the publish review and the overview point out the same links', () => {
  const navigation = [{ id: 'shop', label: 'Shop', url: '/shop' }, { id: 'about', label: 'About', url: '/#about' }]
  const checks = readinessChecks({ theme: { logoUrl: '/l.png', faviconUrl: '/f.ico' }, templates: { 'Home page': [{ id: 'f', type: 'featured_products' }] }, navigation })
  assert.deepEqual(checks.filter(c => c.where === 'menu').map(c => c.text), ['“About”: Opens the top of your homepage: there is no “#about” section on it.'])
  const facts: OverviewFacts = { theme: {}, templates: { 'Home page': [] }, navigation, hasDraft: false, draftSavedAt: null, lastPublish: null, details: { email: true, phone: true, address: true, returnDays: true, refundTime: true, damageReportHours: true }, maintenanceOn: false }
  const menuItem = setupItems(facts).find(item => item.id === 'menu')
  assert.equal(menuItem?.status, 'todo')
  assert.equal(menuItem?.detail, '“About”: Opens the top of your homepage: there is no “#about” section on it.')
})

test('policies: the tabs work with the keyboard, and a card brings its policy into view', () => {
  assert.match(policies, /role="tablist" aria-label="Policies" onKeyDown=\{onTabKey\}/)
  assert.match(policies, /role="tab" aria-selected=\{kind === k\} aria-controls="policy-panel" tabIndex=\{kind === k \? 0 : -1\}/)
  assert.match(policies, /id="policy-panel" role="tabpanel" aria-labelledby=\{`policy-tab-\$\{kind\}`\}/)
  assert.match(policies, /e\.key === 'ArrowRight' \? \(at \+ 1\) % KINDS\.length/)
  assert.match(policies, /onClick=\{\(\) => editFromCard\(k\)\}/)
  assert.match(policies, /document\.getElementById\('policy-tabs'\)\?\.scrollIntoView/)
  assert.match(policies, /Edit below <ArrowDown size=\{12\} aria-hidden="true" \/>/)
})

test('the theme editor opens with nothing selected, and a publish clears the draft in one step', () => {
  const studio = read('components/theme-studio.tsx')
  assert.match(studio, /if \(selectedId && !current\.some\(section => section\.id === selectedId\)\) \{\n\s+setSelectedId\(''\)/)
  assert.doesNotMatch(studio, /setSelectedId\(current\[0\]\?\.id/)
  const publish = read('app/api/admin/theme/publish/route.ts')
  assert.match(publish, /db\.setting\.deleteMany\(\{ where: \{ key: \{ in: \['theme\.draft', 'theme\.draft\.sections', 'navigation\.draft'\] \} \} \}\)/)
  assert.doesNotMatch(publish, /db\.setting\.delete\(\{ where: \{ key: 'theme\.draft/)
})

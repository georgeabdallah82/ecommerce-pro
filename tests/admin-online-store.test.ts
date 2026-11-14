import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fontLabel, menuLinkCount, plural, setupItems, setupProgress, timeAgo, visibleHomeSections, type OverviewFacts } from '@/lib/online-store-overview'
import { resolveStoredTheme } from '@/lib/theme'
import { reviewThemeChanges, type ReviewSnapshot } from '@/lib/theme-review'

// Admin › Online store: the overview page and the theme editor (docs/admin-online-store-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const overview = read('app/admin/online-store/page.tsx')
const studio = read('components/theme-studio.tsx')
const editorPage = read('app/admin/online-store/theme-editor/page.tsx')
const nav = read('components/admin-nav.tsx')
const navCss = read('components/admin-nav.module.css')

const details = (filled: boolean): OverviewFacts['details'] => ({ email: filled, phone: filled, address: filled, returnDays: filled, refundTime: filled, damageReportHours: filled })
const finished: OverviewFacts = {
  theme: {
    logoUrl: '/logo.png',
    faviconUrl: '/icon.png',
    colors: { text: '#111111', background: '#ffffff', muted: '#555555', primary: '#0f766e', buttonText: '#ffffff', announcementText: '#ffffff', announcementBg: '#111111' },
    announcement: { enabled: true, text: 'Free delivery over 50' },
    social: { instagram: 'https://instagram.com/shop' },
    languages: { arabic: true },
  },
  templates: { 'Home page': [{ id: 'h', type: 'header' }, { id: 'a', type: 'hero', settings: { imageUrl: '/hero.jpg' } }, { id: 'b', type: 'featured_products' }, { id: 'c', type: 'faq', enabled: false }, { id: 'f', type: 'footer' }] },
  navigation: [{ id: '1', label: 'Shop', url: '/shop', children: [{ id: '2', label: 'New', url: '/new' }] }, { id: '3', label: 'About', url: '/about' }],
  hasDraft: false,
  draftSavedAt: null,
  lastPublish: { at: '2026-11-01T10:00:00.000Z', by: 'Store owner' },
  details: details(true),
  maintenanceOn: false,
}
const empty: OverviewFacts = { ...finished, theme: {}, templates: { 'Home page': [{ id: 'h', type: 'header' }, { id: 'f', type: 'footer' }] }, navigation: [], details: details(false), maintenanceOn: true }
const byId = (facts: OverviewFacts) => Object.fromEntries(setupItems(facts).map(item => [item.id, item]))

test('the overview counts menu links, nested ones included, and the homepage sections a visitor sees', () => {
  assert.equal(menuLinkCount(finished.navigation), 3)
  assert.equal(menuLinkCount([]), 0)
  assert.equal(menuLinkCount(null as unknown as any[]), 0)
  assert.equal(menuLinkCount([null, { id: 'x', label: 'Only' }]), 1)
  // The header and footer are on every page, and a hidden section is not seen.
  assert.equal(visibleHomeSections(finished.templates), 2)
  assert.equal(visibleHomeSections({}), 0)
  assert.equal(fontLabel('inter'), 'Inter')
  assert.equal(fontLabel('no-such-font'), 'Default')
  assert.equal(fontLabel(undefined), 'Default')
  assert.equal(plural(1, 'link'), '1 link')
  assert.equal(plural(2, 'link'), '2 links')
  assert.equal(plural(0, 'field definition'), '0 field definitions')
})

test('setup is ticked from the store itself: a finished store is all done', () => {
  const items = setupItems(finished)
  assert.deepEqual(items.map(item => item.id), ['logo', 'favicon', 'menu', 'homepage', 'colours', 'contact', 'policies', 'social', 'arabic', 'open'])
  assert.ok(items.every(item => item.status === 'ok'), JSON.stringify(items.filter(item => item.status !== 'ok')))
  assert.deepEqual(setupProgress(items), { done: 8, total: 8 })
  assert.equal(byId(finished).menu.detail, '3 links in the header.')
  assert.equal(byId(finished).homepage.detail, '2 sections visitors see.')
  assert.equal(byId(finished).social.detail, '1 in the footer.')
})

test('a new store sees what is missing, each with the page that fixes it', () => {
  const items = byId(empty)
  for (const id of ['logo', 'favicon', 'menu', 'homepage', 'contact', 'policies', 'open']) assert.equal(items[id].status, 'todo', id)
  assert.equal(items.logo.href, '/admin/online-store/theme-editor?settings=branding')
  assert.equal(items.menu.href, '/admin/online-store/navigation')
  assert.equal(items.menu.detail, 'Your menu is empty, so visitors have no links in the header.')
  assert.equal(items.homepage.detail, 'Your homepage has no visible content sections.')
  assert.equal(items.policies.detail, 'Placeholders show where these are missing: email, phone, address, return days, refund time, damage report time.')
  assert.equal(items.policies.href, '/admin/online-store/policies')
  assert.equal(items.open.detail, 'Maintenance mode is on: visitors see the maintenance page.')
  // No colours set: the store's defaults are used, which are readable.
  assert.equal(items.colours.status, 'ok')
  assert.deepEqual(setupProgress(setupItems(empty)), { done: 1, total: 8 })
})

test('problems the publish review finds show here too: hard-to-read colours, an empty slideshow, an empty announcement', () => {
  const facts: OverviewFacts = {
    ...finished,
    theme: { ...finished.theme, colors: { ...finished.theme.colors, buttonText: '#d1fae5', primary: '#a7f3d0' }, announcement: { enabled: true, text: ' ' } },
    templates: { 'Home page': [{ id: 's', type: 'hero_slider', blocks: [{ settings: {} }] }] },
    navigation: [{ id: '1', label: 'Shop', url: '#' }],
  }
  const items = byId(facts)
  assert.equal(items.colours.status, 'todo')
  assert.match(items.colours.detail, /^Button text on the button colour is \d\.\d:1\. Aim for 4\.5:1 or more/)
  assert.equal(items.colours.href, '/admin/online-store/theme-editor?settings=colors')
  assert.equal(items.homepage.detail, 'The slideshow on your homepage has no images, so it will look empty.')
  assert.equal(items.menu.detail, '“Shop” has no link address.')
  assert.equal(items.announcement.status, 'todo')
  assert.equal(items.announcement.detail, 'The announcement bar is on but has no text.')
  // The announcement item is listed only when there is something to fix.
  assert.equal(byId(finished).announcement, undefined)
})

test('optional items are suggestions: done or not, they never change the progress', () => {
  const without: OverviewFacts = { ...finished, theme: { ...finished.theme, social: {}, languages: { arabic: false } } }
  const items = byId(without)
  assert.equal(items.social.status, 'todo')
  assert.equal(items.social.optional, true)
  assert.equal(items.arabic.optional, true)
  assert.equal(items.arabic.detail, 'Optional: the store is in English only.')
  assert.deepEqual(setupProgress(setupItems(without)), setupProgress(setupItems(finished)))
})

test('times read like a person would say them', () => {
  const now = Date.parse('2026-11-14T12:00:00.000Z')
  assert.equal(timeAgo('2026-11-14T11:59:40.000Z', now), 'just now')
  assert.equal(timeAgo('2026-11-14T11:55:00.000Z', now), '5 minutes ago')
  assert.equal(timeAgo('2026-11-14T09:00:00.000Z', now), '3 hours ago')
  assert.equal(timeAgo('2026-11-13T12:00:00.000Z', now), 'yesterday')
  assert.equal(timeAgo('2026-11-11T12:00:00.000Z', now), '3 days ago')
  assert.equal(timeAgo('2026-09-14T12:00:00.000Z', now), '2 months ago')
})

test('the overview shows the real theme, setup and pages, not fixed text', () => {
  // The broken page used global tile classes with no styles, a "Ready" that never changed and a made-up address.
  assert.doesNotMatch(overview, /yourstore\.com|Ready to publish|className="tile/)
  assert.match(overview, /const user = await requirePermission\('content\.view'\)/)
  assert.match(overview, /getThemeEditorState\(\)/)
  // When the live theme was written, and by whom when a saved version matches that time.
  assert.match(overview, /db\.setting\.findUnique\(\{ where: \{ key: 'theme\.config' \}, select: \{ updatedAt: true \} \}\)/)
  assert.match(overview, /Math\.abs\(lastVersion\.createdAt\.getTime\(\) - liveAt\.getTime\(\)\) < 2 \* 60 \* 1000/)
  // With a draft: "Review and publish" opens the editor's review.
  assert.match(overview, /\{facts\.hasDraft && <Link className=\{ui\.btn\} href=\{`\$\{EDITOR\}\?review=1`\}>/)
  assert.match(overview, /const host = siteUrl\(\)\.replace/)
  assert.match(overview, /role="progressbar" aria-label="Setup" aria-valuemin=\{0\} aria-valuemax=\{progress\.total\} aria-valuenow=\{progress\.done\}/)
  // Pages a staff member cannot open are not offered.
  assert.match(overview, /can\('media\.view'\) \? db\.mediaAsset\.count\(\) : Promise\.resolve\(null\)/)
  assert.match(overview, /show: can\('metafields\.view'\)/)
  assert.match(overview, /show: can\('settings\.view'\)/)
  assert.match(overview, /\{can\('settings\.manage'\) && <p className=\{s\.more\}><Link href="\/admin\/launch">/)
  assert.match(editorPage, /openReview: review === '1'/)
  assert.match(studio, /if \(initial\.openReview && initial\.draft\) void openReview\(\)/)
})

test('the history tab asks for the versions once, says when there are none, and offers a retry', () => {
  // It asked again on every render: hundreds of requests a second while the tab was open.
  assert.match(studio, /if \(sideTab !== 'history' \|\| versionsLoaded \|\| versionsLoading \|\| versionsError\) return/)
  assert.match(studio, /\}, \[sideTab, versionsLoaded, versionsLoading, versionsError\]\)/)
  assert.match(studio, /No published versions yet\. History fills in after your next publish\./)
  assert.match(studio, /role="alert">\{versionsError\} <button type="button" className=\{styles\.linkBtn\} onClick=\{\(\) => setVersionsError\(''\)\}>Try again<\/button>/)
  // A publish adds a version, so the list is fetched again.
  assert.ok((studio.match(/setVersionsLoaded\(false\)/g) || []).length >= 1)
})

test('the publish review lists no changes when there is nothing to publish', () => {
  assert.match(studio, /const groups = data\.firstPublish \|\| !data\.hasDraft \? \[\] : reviewThemeChanges\(/)
  assert.match(studio, /'There are no unpublished changes\.'/)
})

test('the publish review compares what visitors see, so a store saved before the new storefront lists only real changes', () => {
  // Saved before the market storefront: the store shows it with the new colours, fonts, buttons, header and homepage.
  const liveTheme = JSON.stringify({ brandName: 'Shop', colors: { primary: '#111111' }, buttons: { radius: 4, height: 40 }, header: { background: '#000000', transparent: true } })
  const liveHome = JSON.stringify([{ id: 'h', type: 'header', settings: {} }, { id: 'old', type: 'rich_text', settings: { title: 'Welcome' } }, { id: 'f', type: 'footer', settings: {} }])
  // The editor opens on what visitors see, and its first save writes it (the slideshow's slides get new ids).
  const opened = resolveStoredTheme(liveTheme, liveHome)
  assert.equal(opened.theme.design, 'market')
  const seen = (theme: string, home: string): ReviewSnapshot => { const view = resolveStoredTheme(theme, home); return { theme: view.theme, templates: view.editorTemplates, navigation: [] } }
  const draftTheme = JSON.stringify({ ...opened.theme, editorTemplates: opened.editorTemplates })
  assert.deepEqual(reviewThemeChanges(seen(liveTheme, liveHome), seen(draftTheme, JSON.stringify(opened.sections))), [])
  // One real change is the only one listed.
  const hidden = opened.sections.map((section: any) => (section.type === 'trust_strip' ? { ...section, enabled: false } : section))
  const groups = reviewThemeChanges(seen(liveTheme, liveHome), seen(draftTheme, JSON.stringify(hidden)), type => type.replaceAll('_', ' '))
  assert.deepEqual(groups.map(group => [group.title, group.items]), [['Home page', ['Hidden: trust strip']]])
  // The raw saved values listed the new look as changes nobody made.
  const raw = (theme: string, home: string): ReviewSnapshot => ({ theme: JSON.parse(theme), templates: { ...(JSON.parse(theme).editorTemplates || {}), 'Home page': JSON.parse(home) }, navigation: [] })
  assert.ok(reviewThemeChanges(raw(liveTheme, liveHome), raw(draftTheme, JSON.stringify(hidden))).length > 1)
})

test('a block\'s id is not a change; its content is', () => {
  const page = (blocks: any[]): ReviewSnapshot => ({ theme: {}, templates: { 'Home page': [{ id: 's', type: 'hero_slider', settings: {}, blocks }] }, navigation: [] })
  const slide = (id: string, heading: string) => ({ id, type: 'slide', settings: { heading } })
  assert.deepEqual(reviewThemeChanges(page([slide('a1', 'Sale')]), page([slide('b2', 'Sale')])), [])
  assert.deepEqual(reviewThemeChanges(page([slide('a1', 'Sale')]), page([slide('a1', 'New in')]))[0].items, ['Edited Hero slider'])
  assert.deepEqual(reviewThemeChanges(page([slide('a', 'One'), slide('b', 'Two')]), page([slide('b', 'Two'), slide('a', 'One')]))[0].items, ['Edited Hero slider'])
  // The review route resolves both sides; a draft without a homepage publishes the live one.
  const route = read('app/api/admin/theme/review/route.ts')
  assert.match(route, /const \{ theme, editorTemplates \} = resolveStoredTheme\(themeValue, homeValue\)/)
  assert.match(route, /snapshot\(value\('theme\.draft'\), value\('theme\.draft\.sections'\) \?\? value\('theme\.sections'\), value\('navigation\.draft'\) \?\? publishedNav\)/)
  // The store itself uses the same function.
  assert.match(read('lib/theme.ts'), /const \{theme,sections,editorTemplates\}=resolveStoredTheme\(settings\.get\('theme\.config'\),settings\.get\('theme\.sections'\)\)/)
})

test('the editor\'s dialogs move focus in, keep Tab inside, close with Escape and give focus back', () => {
  assert.match(studio, /useModalFocus\(pickerRef, picker, \(\) => \{ setPicker\(false\); setPickerQuery\(''\) \}\)/)
  assert.match(studio, /useModalFocus\(reviewRef, reviewOpen, \(\) => setReviewOpen\(false\)\)/)
  assert.match(studio, /useModalFocus\(confirmRef, Boolean\(confirmState\), \(\) => setConfirmState\(null\)\)/)
  assert.match(studio, /<div ref=\{pickerRef\} className=\{styles\.pickerDialog\} role="dialog" aria-modal="true" aria-labelledby="theme-picker-title"/)
  assert.match(studio, /<h2 id="theme-picker-title" className=\{styles\.pickerTitle\}>Add to this page<\/h2>/)
  assert.match(studio, /<div ref=\{reviewRef\} className=\{styles\.reviewDialog\} role="dialog" aria-modal="true" aria-labelledby="theme-review-title"/)
  assert.match(studio, /<div ref=\{confirmRef\} className=\{styles\.confirmDialog\} role="alertdialog" aria-modal="true" aria-labelledby="theme-confirm-message"/)
  // autoFocus would focus the search before the dialog notes what opened it, and focus would be lost on close.
  const search = studio.slice(studio.indexOf('className={styles.pickerSearch}'), studio.indexOf('/>', studio.indexOf('className={styles.pickerSearch}')))
  assert.match(search, /data-autofocus/)
  assert.doesNotMatch(search, /autoFocus/)
})

test('a confirmation says what it does, and Escape closes a section\'s settings', () => {
  for (const label of ["'Discard changes'", "'Restore'", "'Reset'", "'Delete section'"]) assert.ok(studio.includes(label), label)
  assert.match(studio, /\{confirmState\.label\}/)
  assert.match(studio, /if \(event\.key !== 'Escape' \|\| event\.defaultPrevented \|\| picker \|\| reviewOpen \|\| confirmState\) return/)
})

test('the editor page has one main landmark, a heading and named controls', () => {
  assert.doesNotMatch(studio, /<main className|<\/main>/)
  assert.match(studio, /<h1 className=\{styles\.title\}>Theme editor<\/h1>/)
  assert.match(studio, /href="\/admin\/online-store" aria-label="Back to the online store"/)
  assert.match(studio, /role="group" aria-label="Preview size"/)
  assert.match(studio, /aria-pressed=\{device === item\}/)
  // The preview scrolls, so it can be reached and scrolled with the keyboard.
  assert.match(studio, /<div className=\{styles\.preview\} role="region" aria-label=\{`Preview: \$\{pageLabel\}`\} tabIndex=\{0\}>/)
})

test('the admin bar: the account button\'s name matches what it shows, and the search keeps its name on small screens', () => {
  assert.match(nav, /data-initials=\{avatarUrl \? undefined : initials\}/)
  assert.match(navCss, /\.avatar\[data-initials\]::before \{ content: attr\(data-initials\); \}/)
  // Hidden from sight under 900 px, still read out (it was display: none, which left the button with no name).
  assert.doesNotMatch(navCss, /\.topbarSearch span \{ display: none; \}/)
  assert.match(navCss, /\.topbarSearch span \{ position: absolute; width: 1px; height: 1px;/)
})

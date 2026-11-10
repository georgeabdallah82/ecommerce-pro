import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contrastRatio, readinessChecks, reviewThemeChanges, type ReviewSnapshot } from '@/lib/theme-review'

const section = (id: string, type: string, extra: Record<string, any> = {}) => ({ id, type, enabled: true, settings: {}, blocks: [], ...extra })
const snap = (over: Partial<ReviewSnapshot> = {}): ReviewSnapshot => ({
  theme: { logoUrl: '/logo.png', faviconUrl: '/f.ico', colors: { text: '#121212', background: '#ffffff', muted: '#5b616b', buttonText: '#ffffff', primary: '#d7261e', announcementText: '#ffffff', announcementBg: '#121212' }, announcement: { enabled: true, text: 'Free shipping' }, colorsSet: true },
  templates: { 'Home page': [section('h', 'header'), section('hero', 'hero_slider', { settings: {} }), section('f', 'footer')] },
  navigation: [{ id: 'shop', label: 'Shop', url: '/shop', children: [] }],
  ...over,
})

describe('reviewThemeChanges', () => {
  it('reports nothing when draft equals published', () => {
    assert.deepEqual(reviewThemeChanges(snap(), snap()), [])
  })

  it('lists added, removed, hidden, edited and reordered sections', () => {
    const published = snap({ templates: { 'Home page': [section('a', 'rich_text'), section('b', 'faq'), section('c', 'testimonials')] } })
    const draft = snap({ templates: { 'Home page': [section('c', 'testimonials', { enabled: false }), section('a', 'rich_text', { settings: { title: 'New' } }), section('d', 'newsletter')] } })
    const groups = reviewThemeChanges(published, draft, type => type.replaceAll('_', ' '))
    const items = groups.find(g => g.id === 'page.Home page')!.items
    assert.ok(items.includes('Added newsletter'))
    assert.ok(items.includes('Removed faq'))
    assert.ok(items.includes('Hidden: testimonials'))
    assert.ok(items.includes('Edited rich text'))
    assert.ok(items.includes('Reordered sections'))
  })

  it('names the changed colour settings instead of only saying the group changed', () => {
    const draft = snap({ theme: { ...snap().theme, colors: { ...snap().theme.colors, primary: '#0000ff', accent: '#ff7a1a' } } })
    const colours = reviewThemeChanges(snap(), draft).find(g => g.id === 'theme.colors')!
    assert.deepEqual(colours.items, ['Primary changed', 'Accent changed'])
    assert.equal(colours.title, 'Colours')
  })

  it('summarises a menu change with the item count', () => {
    const draft = snap({ navigation: [{ id: 'shop', label: 'Shop', url: '#', children: [{ id: 'w', label: 'Women', url: '/women' }] }] })
    const menu = reviewThemeChanges(snap(), draft).find(g => g.id === 'navigation')!
    assert.equal(menu.items[0], 'Menu changed (2 items, was 1)')
  })

  it('ignores editor bookkeeping keys', () => {
    const draft = snap({ theme: { ...snap().theme, editorTemplateKey: 'Product', storefrontVersion: 9 } })
    assert.deepEqual(reviewThemeChanges(snap(), draft), [])
  })
})

describe('contrastRatio', () => {
  it('gives 21:1 for black on white and handles 3-digit colours', () => {
    assert.ok(Math.abs((contrastRatio('#000', '#fff') as number) - 21) < 0.01)
  })
  it('returns null for non-hex values', () => {
    assert.equal(contrastRatio('red', '#fff'), null)
  })
  it('puts #767676 just above and #777777 just below the 4.5:1 line on white', () => {
    assert.ok((contrastRatio('#767676', '#ffffff') as number) >= 4.5)
    assert.ok((contrastRatio('#777777', '#ffffff') as number) < 4.5)
  })
})

describe('readinessChecks', () => {
  it('passes a complete, readable store', () => {
    assert.deepEqual(readinessChecks(snap({ templates: { 'Home page': [section('h', 'header'), section('s', 'hero_slider', { blocks: [{ id: 'b', type: 'hero_slide', settings: { imageUrl: '/x.jpg' } }] })] } })), [])
  })

  it('flags a missing logo, an empty announcement and an empty slideshow', () => {
    const checks = readinessChecks(snap({
      theme: { ...snap().theme, logoUrl: '', logoUrlDark: '', announcement: { enabled: true, text: '  ' } },
      templates: { 'Home page': [section('s', 'hero_slider', { blocks: [] })] },
    })).map(c => c.id)
    assert.ok(checks.includes('logo'))
    assert.ok(checks.includes('announcement'))
    assert.ok(checks.some(id => id.startsWith('hero-')))
  })

  it('flags low text contrast and names the pair', () => {
    const checks = readinessChecks(snap({ theme: { ...snap().theme, colors: { ...snap().theme.colors, text: '#777777' } } }))
    const contrast = checks.find(c => c.id === 'contrast-text')
    assert.ok(contrast)
    assert.match(contrast!.text, /Text on the page background is 4\.4:1/)
  })

  it('flags an empty menu and menu entries without a name or address', () => {
    assert.ok(readinessChecks(snap({ navigation: [] })).some(c => c.id === 'menu-empty'))
    const checks = readinessChecks(snap({ navigation: [{ id: 'x', label: '', url: '/a', children: [] }, { id: 'y', label: 'About', url: '#', children: [] }] })).map(c => c.id)
    assert.ok(checks.some(id => id.startsWith('menu-noname-')))
    assert.ok(checks.some(id => id.startsWith('menu-nolink-')))
  })

  it('does not treat a flat dropdown parent with a link-less url as a missing link', () => {
    const flat = [{ id: 'shop', label: 'Shop', url: '#', parentId: null }, { id: 'w', label: 'Women', url: '/women', parentId: 'shop' }]
    assert.equal(readinessChecks(snap({ navigation: flat })).filter(c => c.id.startsWith('menu-nolink-')).length, 0)
  })
})

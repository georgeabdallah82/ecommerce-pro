import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { siteHeaderSections } from '@/lib/site-header'

describe('one announcement bar and header for the whole site', () => {
  it('every page uses the Home list copy, never a page template\'s own old copy', () => {
    const templates = {
      'Home page': [
        { id: 'h', type: 'header', settings: { searchPlaceholder: 'Search Yalla Haul' } },
        { id: 'a', type: 'announcement', blocks: [{ settings: { text: 'Free Delivery for orders above 49$' } }] },
        { id: 'hero', type: 'hero_slider' },
        { id: 'f', type: 'footer' },
      ],
      Product: [
        { id: 'pa', type: 'announcement', settings: { text: 'Free shipping on orders over $50' } },
        { id: 'ph', type: 'header', settings: {} },
        { id: 'mp', type: 'main_product' },
      ],
    }
    assert.deepEqual(siteHeaderSections(templates).map(s => s.id), ['h', 'a'])
    assert.deepEqual(siteHeaderSections({ Product: templates.Product }), [], 'no Home list: the theme-level defaults are used')
    assert.deepEqual(siteHeaderSections(null), [])
  })

  it('the store nav and the editor preview no longer pick a copy by page', () => {
    const nav = readFileSync('components/store-nav-fixed.tsx', 'utf8')
    assert.doesNotMatch(nav, /templateForPath|headerTemplates/)
    assert.match(nav, /theme\.siteHeader \?\? siteHeaderSections\(theme\.editorTemplates\)/)
    assert.match(readFileSync('lib/theme.ts', 'utf8'), /localTheme\.siteHeader=siteHeaderSections\(localTemplates\)/)
    assert.match(readFileSync('components/theme-studio.tsx', 'utf8'), /siteHeader: siteHeaderSections\(templates\)/)
    assert.match(readFileSync('components/theme-preview-frame.tsx', 'utf8'), /siteHeader: view\.siteHeader/)
  })
})

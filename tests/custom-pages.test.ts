import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BLOG_TEMPLATE_KEY, isPageTemplateKey, pageIdFromKey, pageSections, pageTemplateKey, showPageHeader, zoneSections } from '@/lib/custom-pages'

describe('lib/custom-pages', () => {
  it('keys a page by its id and round-trips', () => {
    const key = pageTemplateKey('abc123')
    assert.equal(key, 'Page:abc123')
    assert.equal(isPageTemplateKey(key), true)
    assert.equal(isPageTemplateKey('Home page'), false)
    assert.equal(pageIdFromKey(key), 'abc123')
  })

  it('returns only real content sections for a page', () => {
    const theme = { editorTemplates: { 'Page:p1': [{ id: 'h', type: 'header' }, { id: 'a', type: 'product_grid' }, { id: 'f', type: 'footer' }, null, { id: 'c', type: 'collection_grid' }], 'Page:p2': [{ id: 'x', type: 'faq' }] } }
    assert.deepEqual(pageSections(theme, 'p1').map(s => s.type), ['product_grid', 'collection_grid'])
    assert.deepEqual(pageSections(theme, 'missing'), [])
    assert.deepEqual(pageSections(undefined, 'p1'), [])
  })

  it('shows the title block for plain pages and pages with body text, not for pure section pages', () => {
    assert.equal(showPageHeader({ bodyHtml: '' }, 0), true, 'a page with nothing built keeps its title')
    assert.equal(showPageHeader({ bodyHtml: '<p>Hi</p>' }, 3), true)
    assert.equal(showPageHeader({ bodyHtml: null }, 3), false)
    assert.equal(showPageHeader({ bodyHtml: '   ' }, 3), false)
  })

  it('reads the blog zone from its own key and ignores the legacy "Blog" template', () => {
    const theme = { editorTemplates: {
      Blog: [{ id: 'old', type: 'hero' }, { id: 'old2', type: 'newsletter' }],
      [BLOG_TEMPLATE_KEY]: [{ id: 'f', type: 'footer' }, { id: 'a', type: 'product_grid' }],
    } }
    assert.deepEqual(zoneSections(theme, BLOG_TEMPLATE_KEY).map(s => s.type), ['product_grid'])
    assert.deepEqual(zoneSections({ editorTemplates: { Blog: [{ id: 'old', type: 'hero' }] } }, BLOG_TEMPLATE_KEY), [], 'older seeded Blog sections never show')
    assert.notEqual(BLOG_TEMPLATE_KEY, 'Blog')
  })
})

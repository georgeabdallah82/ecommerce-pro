import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { descriptionHtml } from '@/lib/sanitize-html'
import { money } from '@/lib/config'

describe('lib/sanitize-html descriptionHtml', () => {
  it('keeps paragraphs and line breaks of plain text, escaped', () => {
    assert.equal(descriptionHtml('First line\nsize < 5 cm\n\nNew paragraph & more'), '<p>First line<br>size &lt; 5 cm</p><p>New paragraph &amp; more</p>')
  })
  it('renders imported HTML but strips scripts and handlers', () => {
    const out = descriptionHtml('<p onclick="x()">Hi</p><script>alert(1)</script><ul><li>One</li></ul>')
    assert.ok(out.includes('<p>Hi</p>'))
    assert.ok(out.includes('<li>One</li>'))
    assert.ok(!out.includes('script') && !out.includes('onclick'))
  })
  it('is empty for empty input', () => {
    assert.equal(descriptionHtml(null), '')
    assert.equal(descriptionHtml('   '), '')
  })
})

describe('lib/config money', () => {
  it('formats with symbol and thousands separator', () => assert.equal(money(129999, 'USD'), '$1,299.99'))
  it('falls back for an invalid currency code instead of throwing', () => assert.equal(money(1250, 'DOLLARS'), 'DOLLARS 12.50'))
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeHttpUrl } from '@/lib/safe-url'

describe('lib/safe-url safeHttpUrl', () => {
  it('accepts a web address and gives it back as typed, trimmed', () => {
    assert.equal(safeHttpUrl('https://track.example.com/LB-884213'), 'https://track.example.com/LB-884213')
    assert.equal(safeHttpUrl('  http://track.example.com/x  '), 'http://track.example.com/x')
  })

  it('refuses script, data, relative and other non-web links', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x', '/track/123', 'ftp://files.example.com/x', 'mailto:a@b.co']) {
      assert.equal(safeHttpUrl(bad), null, bad)
    }
  })

  it('refuses empty, broken and overlong values', () => {
    assert.equal(safeHttpUrl(''), null)
    assert.equal(safeHttpUrl(undefined), null)
    assert.equal(safeHttpUrl('https://'), null)
    assert.equal(safeHttpUrl(`https://example.com/${'a'.repeat(500)}`), null)
  })
})

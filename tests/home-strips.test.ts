import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { legacyBlocksToSections, mergeLegacyStrips } from '@/lib/home-strips'

const rows = [
  { id: 'a1', type: 'announcement', title: 'Fallback title', contentJson: JSON.stringify({ text: 'Free delivery over $50' }) },
  { id: 'a2', type: 'announcement', title: 'Second bar', contentJson: '{not json' },
  { id: 'a3', type: 'announcement', title: '', contentJson: '{}' },
  { id: 't1', type: 'trust', title: 'Secure checkout', subtitle: 'Your order is protected' },
  { id: 't2', type: 'trust', title: '', subtitle: '' },
]
const home = [
  { id: 'h', type: 'header' }, { id: 'an', type: 'announcement' }, { id: 'hero1', type: 'hero' }, { id: 'f', type: 'footer' },
]

describe('lib/home-strips', () => {
  it('converts legacy rows, using the same text rules the old page used', () => {
    const { announcement, trust } = legacyBlocksToSections(rows)
    assert.deepEqual(announcement?.blocks?.map(b => b.settings.text), ['Free delivery over $50', 'Second bar'], 'contentJson.text wins, title is the fallback, empty bars are dropped')
    assert.deepEqual(trust?.blocks?.map(b => b.settings.heading), ['Secure checkout', 'Why shop with us'])
    assert.equal(trust?.blocks?.[0].settings.text, 'Your order is protected')
  })

  it('places the announcement strip above page content and the trust strip before the footer', () => {
    const { sections, changed } = mergeLegacyStrips(home, rows)
    assert.equal(changed, true)
    assert.deepEqual(sections.map(s => s.type), ['header', 'announcement', 'announcement_strip', 'hero', 'trust_strip', 'footer'])
  })

  it('never duplicates a strip the merchant already has, and does nothing without rows', () => {
    const existing = [...home.slice(0, 3), { id: 'x', type: 'trust_strip' }, home[3]]
    const merged = mergeLegacyStrips(existing, rows)
    assert.equal(merged.sections.filter(s => s.type === 'trust_strip').length, 1)
    assert.equal(mergeLegacyStrips(home, []).changed, false)
  })
})

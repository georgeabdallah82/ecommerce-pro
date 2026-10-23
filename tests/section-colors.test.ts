import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { contrastRatio, readableTextOn, sectionColors } from '@/lib/section-colors'

describe('section colours (theme studio > Design)', () => {
  it('leaves a section alone until a colour is chosen', () => {
    assert.equal(sectionColors('product_rail', {}), null)
    assert.equal(sectionColors('product_rail', { sectionBg: '', sectionText: '' }), null)
    assert.equal(sectionColors('product_rail', null), null)
  })

  it('uses the chosen background and picks readable text for it', () => {
    assert.deepEqual(sectionColors('product_tabs', { sectionBg: '#d7261e' }), { background: '#d7261e', color: '#ffffff' })
    assert.deepEqual(sectionColors('category_strip', { sectionBg: '#fff1e6' }), { background: '#fff1e6', color: '#171717' })
    assert.deepEqual(sectionColors('product_rail', { sectionBg: '#121212', sectionText: '#ff7a1a' }), { background: '#121212', color: '#ff7a1a' })
  })

  it('ignores anything that is not a colour code', () => {
    assert.equal(sectionColors('product_rail', { sectionBg: 'red; display:none' }), null)
    assert.deepEqual(sectionColors('product_rail', { sectionBg: '#FFF' }), { background: '#FFF', color: '#171717' })
  })

  it('has no band for sections drawn elsewhere or covered by a photo', () => {
    for (const type of ['header', 'footer', 'announcement', 'announcement_strip', 'hero', 'hero_slider', 'slideshow']) {
      assert.equal(sectionColors(type, { sectionBg: '#d7261e' }), null, type)
    }
  })

  it('measures contrast the WCAG way', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21)
    assert.equal(contrastRatio('#d7261e', '#d7261e'), 1)
    assert.equal(readableTextOn('#ffffff'), '#171717')
    assert.equal(readableTextOn('#121212'), '#ffffff')
  })

  it('wraps every storefront section and the studio Design tab offers the colours', () => {
    const sections = readFileSync('components/storefront-sections.tsx', 'utf8')
    assert.match(sections, /visible\.map\(\(section:any\)=>withSectionColors\(section,/)
    const studio = readFileSync('components/theme-studio.tsx', 'utf8')
    assert.match(studio, /<SectionDesign section=\{selected\}/)
    assert.doesNotMatch(studio, /Content width/)
  })
})

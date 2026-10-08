import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { slugify } from '@/lib/slug'

describe('lib/slug', () => {
  it('keeps the existing behaviour for English names', () => {
    assert.equal(slugify('Baloo Tissues'), 'baloo-tissues')
    assert.equal(slugify('  Summer   Sale -- 2026! '), 'summer-sale-2026')
  })

  it('spells Arabic names in Latin letters instead of leaving "-"', () => {
    // The live product that surfaced this: its address was /product/-
    const name = 'سوار مخصص من الفولاذ المقاوم للصدأ للنساء والرجال مع تصميم عين واقعي - مجوهرات مخصصة'
    const slug = slugify(name)
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)+$/)
    assert.ok(slug.startsWith('swar-mkhss-mn-alfwlath'), slug)
    assert.equal(slugify('أحذية رياضية'), 'ahthya-ryadya')
    assert.equal(slugify('حقيبة ٢٠٢٦'), 'hqyba-2026')
  })

  it('drops accents and short vowels but keeps the letters', () => {
    assert.equal(slugify('Café Crème'), 'cafe-creme')
    assert.equal(slugify('مَدْرَسَة'), 'mdrsa')
  })

  it('never returns a bare or edge dash, so callers can fall back to another value', () => {
    assert.equal(slugify('-'), '')
    assert.equal(slugify(' - '), '')
    assert.equal(slugify('中文 - 产品'), '')
    assert.equal(slugify('-shoes-'), 'shoes')
  })
})

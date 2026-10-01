import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SECTION_PRESETS } from '@/lib/section-presets'

// Section and block types the storefront renderer and the studio's block editor know.
const SECTION_TYPES = new Set(['hero', 'promo_grid', 'product_grid', 'collection_grid', 'image_with_text', 'trust_badges', 'stats', 'testimonials', 'faq', 'newsletter'])
const BLOCK_TYPES = new Set(['promo', 'quote', 'question'])

describe('lib/section-presets', () => {
  it('has unique ids, labels and descriptions', () => {
    const ids = SECTION_PRESETS.map(p => p.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const preset of SECTION_PRESETS) {
      assert.ok(preset.label.trim() && preset.description.trim(), preset.id)
      assert.ok(preset.items.length > 0, `${preset.id} has sections`)
    }
  })

  it('only uses section and block types the storefront can render', () => {
    for (const preset of SECTION_PRESETS) {
      for (const item of preset.items) {
        assert.ok(SECTION_TYPES.has(item.type), `${preset.id}: unknown section type ${item.type}`)
        for (const block of item.blocks || []) assert.ok(BLOCK_TYPES.has(block.type), `${preset.id}: unknown block type ${block.type}`)
      }
    }
  })

  it('gives every block-based section its blocks', () => {
    for (const preset of SECTION_PRESETS) {
      for (const item of preset.items) {
        if (['promo_grid', 'testimonials', 'faq'].includes(item.type)) assert.ok((item.blocks || []).length > 0, `${preset.id}: ${item.type} needs blocks`)
      }
    }
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isShareableImage, metaText } from '@/lib/seo'
import { fitWithin } from '@/lib/optimize-image'

describe('lib/seo', () => {
  it('turns HTML and placeholders into clean meta descriptions', () => {
    assert.equal(metaText('0'), undefined)
    assert.equal(metaText(' - '), undefined)
    assert.equal(metaText(null), undefined)
    assert.equal(metaText('<p>Soft   tissues,&nbsp;<b>3-ply</b></p>'), 'Soft tissues, 3-ply')
    const long = metaText('word '.repeat(80))!
    assert.ok(long.length <= 160 && long.endsWith('…'))
  })

  it('only offers raster images for share previews (WhatsApp/Facebook ignore SVG)', () => {
    assert.equal(isShareableImage('/api/media/logo.svg'), false)
    assert.equal(isShareableImage('data:image/png;base64,AAA'), false)
    assert.equal(isShareableImage(''), false)
    assert.equal(isShareableImage('/api/media/1788990274617-r2eksv.png'), true)
    assert.equal(isShareableImage('https://cdn.example.com/a.webp?v=2'), true)
  })
})

describe('lib/optimize-image', () => {
  it('fits big photos inside 1600px without upscaling small ones', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 })
    assert.deepEqual(fitWithin(1200, 3000), { width: 640, height: 1600 })
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  })
})

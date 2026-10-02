import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeNavUrl, whatsappDigits, whatsappUrl } from '@/lib/links'

describe('lib/links', () => {
  it('makes hand-typed menu links absolute', () => {
    assert.equal(normalizeNavUrl('about-us'), '/about-us')
    assert.equal(normalizeNavUrl(' pages/faq '), '/pages/faq')
    assert.equal(normalizeNavUrl('/collections/goods'), '/collections/goods')
    assert.equal(normalizeNavUrl('https://instagram.com/x'), 'https://instagram.com/x')
    assert.equal(normalizeNavUrl('instagram.com/yallahaul'), 'https://instagram.com/yallahaul')
    assert.equal(normalizeNavUrl('mailto:hi@shop.com'), 'mailto:hi@shop.com')
    assert.equal(normalizeNavUrl('#top'), '#top')
    assert.equal(normalizeNavUrl(''), '')
    assert.equal(normalizeNavUrl(null), '')
  })

  it('adds the store country code to local WhatsApp numbers', () => {
    assert.equal(whatsappDigits('79137663', 'Lebanon'), '96179137663')
    assert.equal(whatsappDigits('03 123 456', 'Lebanon'), '9613123456')
    assert.equal(whatsappDigits('+961 79 137 663', 'Lebanon'), '96179137663')
    assert.equal(whatsappDigits('00961 79137663', 'Lebanon'), '96179137663')
    assert.equal(whatsappDigits('96179137663', 'Lebanon'), '96179137663')
    assert.equal(whatsappDigits('5551234567', 'Narnia'), '5551234567')
    assert.equal(whatsappUrl('', 'Lebanon'), '')
    assert.equal(whatsappUrl('79137663', 'lebanon'), 'https://wa.me/96179137663')
  })
})

describe('safeNextPath', () => {
  it('only allows same-site paths', async () => {
    const { safeNextPath } = await import('@/lib/links')
    assert.equal(safeNextPath('/product/tissue?x=1'), '/product/tissue?x=1')
    assert.equal(safeNextPath('//evil.com'), '/account')
    assert.equal(safeNextPath('/\\evil.com'), '/account')
    assert.equal(safeNextPath('https://evil.com'), '/account')
    assert.equal(safeNextPath(''), '/account')
    assert.equal(safeNextPath(undefined, '/'), '/')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STOREFRONT_VERSION, parseDeliveryAreas, switchToMarket } from '@/lib/storefront-market'

const oldTheme = { brandName: 'Yalla Haul', logoUrl: '/logo.svg', colors: { primary: '#ff0000', background: '#fffaf6' }, typography: { heading: 'spaceGrotesk', body: 'inter' }, header: { style: 'classic', background: '#ffffff', transparent: true }, social: { instagram: 'https://instagram.com/x' } }
const oldHome = [
  { id: 'a', type: 'announcement', enabled: true, settings: {}, blocks: [{ id: 'm', type: 'message', settings: { text: 'Hi' } }] },
  { id: 'h', type: 'header', enabled: true, settings: {} },
  { id: 'f', type: 'flash_deals', enabled: true, settings: {} },
  { id: 'x', type: 'hero', enabled: true, settings: {} },
  { id: 'z', type: 'footer', enabled: true, settings: {} },
]

describe('lib/storefront-market switchToMarket', () => {
  it('moves an older store onto the new storefront once, keeping its brand and site-wide rows', () => {
    const { theme, sections, switched } = switchToMarket(oldTheme, oldHome)
    assert.equal(switched, true)
    assert.equal(theme.brandName, 'Yalla Haul')
    assert.equal(theme.logoUrl, '/logo.svg')
    assert.deepEqual(theme.social, oldTheme.social)
    assert.equal((theme as any).design, 'market')
    assert.equal((theme as any).storefrontVersion, STOREFRONT_VERSION)
    assert.equal(theme.colors.primary, '#d7261e')
    assert.equal(theme.typography.heading, 'dmSans')
    assert.equal(theme.header.background, '')
    assert.equal(theme.header.transparent, false)
    const types = sections.map(s => s.type)
    assert.equal(types[0], 'header')
    assert.equal(types.at(-1), 'footer')
    assert.ok(types.includes('announcement'))
    assert.ok(types.includes('hero_slider'))
    assert.ok(!types.includes('flash_deals'), 'the fake-countdown flash deals row is dropped')
    assert.ok(!types.includes('hero'))
    assert.equal(sections.find(s => s.type === 'announcement')?.blocks?.[0]?.settings?.text, 'Hi')
  })

  it('leaves an already switched store alone, so later edits stick', () => {
    const first = switchToMarket(oldTheme, oldHome)
    const edited = { ...first.theme, colors: { ...first.theme.colors, primary: '#123456' } }
    const again = switchToMarket(edited, [{ id: 'h', type: 'header' }])
    assert.equal(again.switched, false)
    assert.equal(again.theme.colors.primary, '#123456')
    assert.deepEqual(again.sections, [{ id: 'h', type: 'header' }])
  })
})

describe('lib/storefront-market parseDeliveryAreas', () => {
  it('reads "Area | time" lines and skips blanks', () => {
    assert.deepEqual(parseDeliveryAreas('Beirut | Tomorrow\n\n  Metn  \nNorth | 48h | approx'), [
      { name: 'Beirut', eta: 'Tomorrow' }, { name: 'Metn', eta: '' }, { name: 'North', eta: '48h | approx' },
    ])
  })
})

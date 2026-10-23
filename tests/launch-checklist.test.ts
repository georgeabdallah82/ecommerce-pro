import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MANUAL_IDS, buildChecklist, mentionedAmounts, topBarMismatch, type LaunchFacts } from '@/lib/launch-checklist'
import { parseManual } from '@/lib/launch-facts'

const ready: LaunchFacts = {
  storeName: 'Yalla Haul', logoUrl: '/api/media/logo.svg', contactPhone: '+961 79 137 663', whatsappNumber: '',
  codOn: true, cardOn: false, freeShippingThreshold: 50, announcementText: 'Free delivery over $50 · Cash on delivery',
  shippingZones: 2, activeProducts: 12, productsWithoutPhoto: 0, productsWithoutPrice: 0,
  twoStepOn: true, phoneAlertsOn: true, emailConfigured: true, maintenanceOn: false, orderCount: 0,
  arabicOn: true, socialLinks: 3, adTracking: true, footerText: 'Home essentials, delivered.',
  manual: Object.fromEntries(MANUAL_IDS.map(id => [id, '2026-10-17T10:00:00Z'])),
}
const item = (f: LaunchFacts, id: string) => buildChecklist(f).items.find(i => i.id === id)!

describe('launch checklist: amounts in the top bar', () => {
  it('finds dollar amounts however they are written', () => {
    assert.deepEqual(mentionedAmounts('Free Delivery for orders above 49$ - Cash On Delivery'), [49])
    assert.deepEqual(mentionedAmounts('Free delivery on orders over $50 · Cash on delivery'), [50])
    assert.deepEqual(mentionedAmounts('Free shipping over 50 USD, $5 off today'), [50, 5])
    assert.deepEqual(mentionedAmounts('Free delivery over 12,5 dollars'), [12.5])
    assert.deepEqual(mentionedAmounts('10% off everything'), [])
  })

  it('catches the top bar promising a different amount than the store uses', () => {
    assert.equal(topBarMismatch('Free delivery over $49, or $5 off your first order', 50), 49)
    assert.equal(topBarMismatch('Free Delivery for orders above 49$ - Cash On Delivery', 50), null, 'one amount is kept in step automatically')
    assert.equal(topBarMismatch('Free delivery on orders over $50', 50), null)
    assert.equal(topBarMismatch('Free delivery on orders over $50, or $5 off your first order', 50), null, 'one of the amounts is the right one')
  })

  it('stays quiet when there is nothing to compare', () => {
    assert.equal(topBarMismatch('Free delivery all over Lebanon', 50), null)
    assert.equal(topBarMismatch('Summer sale: everything $10', 50), null, 'not about free delivery')
    assert.equal(topBarMismatch('Free delivery over $49', null), null)
  })
})

describe('launch checklist: ticking itself', () => {
  it('a store that is set up has everything ready', () => {
    const c = buildChecklist(ready)
    assert.equal(c.ready, true)
    assert.equal(c.before.done, c.before.total)
    assert.ok(c.items.every(i => i.status === 'ok'), c.items.filter(i => i.status !== 'ok').map(i => i.id).join(','))
  })

  it('every problem shows up as its own item with where to fix it', () => {
    assert.equal(item({ ...ready, logoUrl: '' }, 'brand').status, 'todo')
    assert.equal(item({ ...ready, storeName: 'Your Brand' }, 'brand').status, 'todo')
    assert.equal(item({ ...ready, contactPhone: '', whatsappNumber: '' }, 'contact').status, 'todo')
    assert.equal(item({ ...ready, contactPhone: '', whatsappNumber: '+96179137663' }, 'contact').status, 'ok', 'the WhatsApp button number is enough')
    assert.equal(item({ ...ready, activeProducts: 0 }, 'products').status, 'todo')
    const photos = item({ ...ready, productsWithoutPhoto: 3 }, 'products')
    assert.equal(photos.status, 'warn')
    assert.match(photos.detail, /3 products without a photo/)
    assert.equal(item({ ...ready, shippingZones: 0 }, 'delivery').href, '/admin/shipping')
    assert.equal(item({ ...ready, codOn: false, cardOn: false }, 'payments').status, 'todo')
    assert.equal(item({ ...ready, emailConfigured: false }, 'email').status, 'todo')
    assert.equal(item({ ...ready, phoneAlertsOn: false }, 'alerts').status, 'todo')
    assert.equal(item({ ...ready, twoStepOn: false }, 'twostep').href, '/admin/settings')
  })

  it('the top bar item warns with both amounts, in plain words', () => {
    const top = item({ ...ready, announcementText: 'Free delivery over 49$, or $5 off your first order' }, 'topbar')
    assert.equal(top.status, 'warn')
    assert.match(top.detail, /says \$49, but free delivery starts at \$50/)
  })

  it('test orders left in the store are flagged until they are cleared', () => {
    const left = item({ ...ready, orderCount: 7 }, 'testdata')
    assert.equal(left.status, 'warn')
    assert.match(left.detail, /7 orders in the store/)
    assert.match(left.detail, /ready to launch/)
  })

  it('opening the store is the last step, and ticks when maintenance mode is off', () => {
    assert.equal(item({ ...ready, maintenanceOn: true }, 'open').status, 'todo')
    assert.equal(item(ready, 'open').status, 'ok')
    const before = buildChecklist({ ...ready, maintenanceOn: true }).items.filter(i => i.group === 'before')
    assert.equal(before[before.length - 1].id, 'open')
  })

  it('the things the store cannot see are ticked by hand', () => {
    const c = buildChecklist({ ...ready, manual: {} })
    for (const id of MANUAL_IDS) { const i = c.items.find(x => x.id === id)!; assert.equal(i.manual, true, id); assert.equal(i.status, 'todo', id) }
    assert.equal(c.ready, false)
    assert.equal(item({ ...ready, manual: { testorder: '2026-10-17T10:00:00Z' } }, 'testorder').status, 'ok')
  })

  it('"after launch" items never hold up the launch', () => {
    const c = buildChecklist({ ...ready, arabicOn: false, socialLinks: 0, footerText: '', adTracking: false, manual: { ...ready.manual, searchconsole: '', instagramshop: '' } })
    assert.equal(c.ready, true)
    assert.ok(c.items.filter(i => i.group === 'after').some(i => i.status === 'todo'))
  })

  it('reads the saved ticks, ignoring junk and unknown items', () => {
    assert.deepEqual(parseManual('{"testorder":"2026-10-17T10:00:00Z","nope":"x","backup":5}'), { testorder: '2026-10-17T10:00:00Z' })
    assert.deepEqual(parseManual('not json'), {})
    assert.deepEqual(parseManual('[1,2]'), {})
    assert.deepEqual(parseManual(null), {})
  })
})

describe('launch checklist: wired in', () => {
  const read = (path: string) => readFileSync(path, 'utf8')
  it('is reachable from the Health menu entry, owner only, and its save route checks the permission', () => {
    assert.match(read('app/admin/layout.tsx'), /label: 'Health'.*alsoActive: \['\/admin\/launch'/)
    assert.match(read('components/health-tabs.tsx'), /href: '\/admin\/launch', label: 'Launch checklist'/)
    assert.match(read('app/admin/launch/page.tsx'), /<HealthTabs current="launch"/)
    assert.match(read('app/admin/launch/page.tsx'), /requirePermission\('settings\.manage'\)/)
    assert.match(read('app/api/admin/launch-checklist/route.ts'), /requirePermission\('settings\.manage'\)/)
  })
})

describe('launch checklist: heavy product photos', () => {
  it('names the heavy photos and says how to shrink them', () => {
    const c = buildChecklist({ ...ready, heavyPhotos: [{ product: 'Tissue', kb: 598 }] })
    const photo = c.items.find(i => i.id === 'photosize')!
    assert.equal(photo.status, 'warn')
    assert.match(photo.detail, /Tissue \(598 KB\)/)
    assert.match(photo.detail, /add it again/)
    assert.equal(c.ready, false)
  })
  it('is fine when every photo is light, or when sizes are unknown', () => {
    assert.equal(buildChecklist({ ...ready, heavyPhotos: [] }).items.find(i => i.id === 'photosize')!.status, 'ok')
    assert.equal(buildChecklist(ready).items.find(i => i.id === 'photosize')!.status, 'ok')
  })
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { bestDeal, dealDiscount, dealsForProduct, dealsProblem, nextOffer, normalizeQuantityDeals, publicDeals, type DealLine, type QuantityDeal } from '@/lib/quantity-deals-shared'

const read = (path: string) => readFileSync(path, 'utf8')
const line = (productId: string, quantity: number, unitPrice = 1000, taxable = true): DealLine => ({ productId, quantity, unitPrice, totalPrice: unitPrice * quantity, taxable })
const deal = (extra: Partial<QuantityDeal> = {}): QuantityDeal => ({ id: 'd1', name: 'Deal', active: true, scope: 'all', productIds: [], tiers: [{ quantity: 2, kind: 'percent', value: 10 }], ...extra })

describe('quantity deals: what is saved', () => {
  it('keeps good offers in order, one per quantity, at most four', () => {
    const c = normalizeQuantityDeals({ enabled: true, deals: [{ id: 'a', name: ' Soap ', scope: 'products', productIds: ['p1', 'p1', 'p2', ''], tiers: [
      { quantity: 5, kind: 'percent', value: 25 }, { quantity: 2, kind: 'percent', value: 10 }, { quantity: 2, kind: 'percent', value: 12 }, { quantity: 3, kind: 'total', value: 2000 },
      { quantity: 4, kind: 'percent', value: 20 }, { quantity: 6, kind: 'percent', value: 30 },
    ] }] })
    assert.equal(c.enabled, true)
    assert.equal(c.deals[0].name, 'Soap')
    assert.deepEqual(c.deals[0].productIds, ['p1', 'p2'])
    assert.deepEqual(c.deals[0].tiers.map(t => [t.quantity, t.kind, t.value]), [[2, 'percent', 12], [3, 'total', 2000], [4, 'percent', 20], [5, 'percent', 25]])
  })

  it('drops offers that cannot work (one unit, 0%, 95%, no price, text) and anything that is not a deal', () => {
    const c = normalizeQuantityDeals({ deals: [{ id: 'a', tiers: [
      { quantity: 1, kind: 'percent', value: 10 }, { quantity: 2, kind: 'percent', value: 0 }, { quantity: 2, kind: 'percent', value: 95 },
      { quantity: 3, kind: 'total', value: 0 }, { quantity: 'x', kind: 'percent', value: 10 }, { quantity: 100, kind: 'percent', value: 10 }, null,
    ] }, null, 'nope', { name: 'no id' }, { id: 'a', tiers: [] }] })
    assert.equal(c.deals.length, 1)
    assert.deepEqual(c.deals[0].tiers, [])
    assert.equal(normalizeQuantityDeals(null).enabled, false)
    assert.deepEqual(normalizeQuantityDeals('x'), { enabled: false, deals: [] })
  })

  it('is off unless it is exactly true, and a deal is active unless switched off', () => {
    assert.equal(normalizeQuantityDeals({ enabled: 'true', deals: [] }).enabled, false)
    assert.equal(normalizeQuantityDeals({ deals: [{ id: 'a', active: false, tiers: [{ quantity: 2, kind: 'percent', value: 5 }] }] }).deals[0].active, false)
    assert.equal(normalizeQuantityDeals({ deals: [{ id: 'a', tiers: [{ quantity: 2, kind: 'percent', value: 5 }] }] }).deals[0].active, true)
  })

  it('tells the owner what to fix before saving', () => {
    assert.match(dealsProblem({ enabled: true, deals: [deal({ name: 'Soap', tiers: [] })] }), /"Soap" needs at least one offer/)
    assert.match(dealsProblem({ enabled: true, deals: [deal({ name: 'Soap', scope: 'products', productIds: [] })] }), /choose the products/)
    assert.equal(dealsProblem({ enabled: true, deals: [deal()] }), '')
  })
})

describe('quantity deals: what the shopper saves', () => {
  it('"Buy 2, save 10%": nothing for one, 10% of those items for two or more', () => {
    assert.equal(dealDiscount(deal(), [line('a', 1)]).total, 0)
    assert.equal(dealDiscount(deal(), [line('a', 2)]).total, 200)
    assert.equal(dealDiscount(deal(), [line('a', 5)]).total, 500)
  })

  it('"3 for $20": a group of three costs $20, the rest stays at the normal price', () => {
    const d = deal({ tiers: [{ quantity: 3, kind: 'total', value: 2000 }] })
    assert.equal(dealDiscount(d, [line('a', 2)]).total, 0)
    assert.equal(dealDiscount(d, [line('a', 3)]).total, 1000)
    assert.equal(dealDiscount(d, [line('a', 4)]).total, 1000)
    assert.equal(dealDiscount(d, [line('a', 6)]).total, 2000)
  })

  it('a group price uses the cheapest units first, and never gives money back when it is not a saving', () => {
    const d = deal({ tiers: [{ quantity: 3, kind: 'total', value: 2000 }] })
    assert.equal(dealDiscount(d, [line('a', 1, 500), line('b', 2, 1000)]).total, 500)
    assert.equal(dealDiscount(d, [line('a', 3, 600)]).total, 0)
  })

  it('when several offers are reached, the one that saves the most is used (never added)', () => {
    const d = deal({ tiers: [{ quantity: 2, kind: 'percent', value: 10 }, { quantity: 3, kind: 'percent', value: 20 }] })
    assert.equal(dealDiscount(d, [line('a', 2)]).total, 200)
    assert.equal(dealDiscount(d, [line('a', 3)]).total, 600)
    const mixed = deal({ tiers: [{ quantity: 2, kind: 'total', value: 1500 }, { quantity: 3, kind: 'percent', value: 30 }] })
    assert.equal(dealDiscount(mixed, [line('a', 3)]).total, 900)
  })

  it('only the products it covers count, together', () => {
    const d = deal({ scope: 'products', productIds: ['a', 'b'] })
    assert.equal(dealDiscount(d, [line('a', 1), line('b', 1), line('c', 5)]).total, 200) // a + b = 2 units; c is not covered
    assert.equal(dealDiscount(d, [line('c', 5)]).total, 0)
    assert.equal(dealDiscount(deal(), [line('a', 1), line('c', 1)]).total, 200) // "everything": any two products
  })

  it('tax is worked out only on the taxable share of the saving', () => {
    const split = dealDiscount(deal(), [line('a', 2, 1000, true), line('b', 2, 1000, false)])
    assert.deepEqual(split, { total: 400, taxable: 200, nonTaxable: 200 })
  })

  it('never takes off more than the items cost', () => {
    const d = deal({ tiers: [{ quantity: 2, kind: 'total', value: 1 }] })
    assert.ok(dealDiscount(d, [line('a', 2, 10)]).total <= 20)
  })

  it('the deal that saves the most wins; switched off, inactive or empty deals give nothing', () => {
    const small = deal({ id: 's' })
    const big = deal({ id: 'b', tiers: [{ quantity: 2, kind: 'percent', value: 30 }] })
    const cart = [line('a', 2)]
    assert.equal(bestDeal({ enabled: true, deals: [small, big] }, cart)?.deal.id, 'b')
    assert.equal(bestDeal({ enabled: false, deals: [big] }, cart), null)
    assert.equal(bestDeal({ enabled: true, deals: [{ ...big, active: false }] }, cart), null)
    assert.equal(bestDeal({ enabled: true, deals: [{ ...big, tiers: [] }] }, cart), null)
    assert.equal(bestDeal({ enabled: true, deals: [big] }, [line('a', 1)]), null)
  })
})

describe('quantity deals: what the pages show', () => {
  const config = normalizeQuantityDeals({ enabled: true, deals: [
    { id: 'a', scope: 'products', productIds: ['p1'], tiers: [{ quantity: 2, kind: 'percent', value: 10 }, { quantity: 4, kind: 'total', value: 3000 }] },
    { id: 'b', scope: 'all', tiers: [{ quantity: 3, kind: 'percent', value: 5 }] },
    { id: 'c', active: false, tiers: [{ quantity: 2, kind: 'percent', value: 50 }] },
  ] })

  it('shoppers get only switched-on deals with offers, and nothing at all when the feature is off', () => {
    assert.deepEqual(publicDeals(config).map(d => d.id), ['a', 'b'])
    assert.deepEqual(publicDeals({ ...config, enabled: false }), [])
    assert.equal('name' in publicDeals(config)[0], false)
  })

  it('a product page shows the deals that cover it', () => {
    const deals = publicDeals(config)
    assert.deepEqual(dealsForProduct(deals, 'p1').map(d => d.id), ['a', 'b'])
    assert.deepEqual(dealsForProduct(deals, 'p9').map(d => d.id), ['b'])
  })

  it('the cart says how many more to add for the next offer', () => {
    const deals = publicDeals(config)
    assert.deepEqual(nextOffer(deals, [{ productId: 'p1', quantity: 1 }]) && { more: nextOffer(deals, [{ productId: 'p1', quantity: 1 }])!.more, kind: nextOffer(deals, [{ productId: 'p1', quantity: 1 }])!.tier.kind }, { more: 1, kind: 'percent' })
    assert.equal(nextOffer(deals, [{ productId: 'p1', quantity: 3 }])?.more, 1) // the next one is 4 for a total price
    assert.equal(nextOffer(deals, [{ productId: 'p1', quantity: 4 }]), null)
    assert.equal(nextOffer(deals, []), null)
    assert.equal(nextOffer(deals, [{ productId: 'p9', quantity: 1 }])?.tier.quantity, 3) // only the "everything" deal covers p9
  })
})

describe('quantity deals: how it is wired', () => {
  it('checkout and the price summary price it through the same automatic-discount step', () => {
    const source = read('lib/checkout-discounts.ts')
    assert.match(source, /bestDeal\(await getQuantityDeals\(\)/)
    assert.match(source, /quantity\.split\.total > best\.discount\.total/)
    assert.match(read('app/api/checkout/route.ts'), /findAutomaticDiscount\(subtotal/)
    assert.match(read('app/api/checkout/quote/route.ts'), /findAutomaticDiscount\(subtotal/)
  })

  it('a deal has no discount row to count uses on, so checkout skips that step for it', () => {
    assert.match(read('app/api/checkout/route.ts'), /if \(coupon\?\.id && !coupon\.invite\) \{/)
  })

  it('a typed code still replaces automatic discounts, quantity deals included', () => {
    assert.match(read('app/api/checkout/route.ts'), /input\.couponCode\s*\n?\s*\? await applyCoupon[\s\S]*: await findAutomaticDiscount/)
  })

  it('the storefront gets the deals with the selling settings, the product page with the page itself', () => {
    assert.match(read('lib/selling-config.ts'), /quantityDeals,/)
    assert.match(read('app/api/store/settings/route.ts'), /quantityDeals:selling\.quantityDeals/)
    assert.match(read('app/product/[slug]/page.tsx'), /quantityDeals=\{dealsForProduct\(selling\?\.quantityDeals \|\| \[\], product\.id\)\}/)
    assert.match(read('components/aliexpress-product.tsx'), /<QuantityDealsBox deals=\{quantityDeals\} \/>/)
    assert.match(read('components/aliexpress-cart.tsx'), /<QuantityDealBar items=\{selectedItems\} \/>/)
  })

  it('saving needs the discounts permission and is written to the history', () => {
    const route = read('app/api/admin/quantity-deals/route.ts')
    assert.match(route, /requirePermission\('coupons\.manage'\)/)
    assert.match(route, /await audit\(actor\.id, 'quantity_deals\.updated'/)
    assert.match(route, /dealsProblem\(config\)/)
    assert.match(read('app/admin/marketing/quantity-deals/page.tsx'), /requirePermission\('coupons\.view'\)/)
    assert.match(read('app/admin/layout.tsx'), /href: '\/admin\/marketing\/quantity-deals', label: 'Quantity deals', permission: 'coupons\.view'/)
  })

  it('needs no database change: it lives in one setting row', () => {
    assert.match(read('lib/quantity-deals.ts'), /db\.setting\.upsert/)
    assert.doesNotMatch(read('lib/quantity-deals-shared.ts'), /prisma/)
  })

  it('numbers typed in the admin form do not jump around while typing', () => {
    const view = read('components/quantity-deals-admin.tsx')
    assert.match(view, /import \{ NumInput \} from '@\/components\/num-input'/)
    assert.doesNotMatch(view, /type="number"/)
  })
})

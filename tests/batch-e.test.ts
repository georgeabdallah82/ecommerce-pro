import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { alreadyUsedTotp, base32Decode, base32Encode, hashBackupCode, matchBackupCode, matchTotp, newBackupCodes, newSecret, openSecret, otpauthUri, sealSecret, timeStep, totpAt } from '@/lib/two-step'
import { canEncode, code128Bars, code128Values } from '@/lib/code128'
import { LABEL_LAYOUTS, labelPages, moduleWidthMm } from '@/lib/labels'
import { changeError, newCompareAt, newPrice, previewPrices, roundPrice, type PriceChange } from '@/lib/bulk-prices'
import { computeProfit, type ProfitOrder } from '@/lib/profit'
import { activeOccasion, cleanLink, defaultsFor, nextFixedDate, occasionError, readOccasions, upcomingOccasions } from '@/lib/occasions'
import { readSuppliers, supplierKey, supplierPhones } from '@/lib/suppliers'

process.env.AUTH_SECRET ||= 'test-secret-for-two-step-login'

describe('2-step login codes', () => {
  // RFC 6238 test secret: the ASCII "12345678901234567890".
  const rfc = base32Encode(new TextEncoder().encode('12345678901234567890'))
  it('makes the standard codes (RFC 6238 test values)', async () => {
    assert.equal(rfc, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    assert.equal(await totpAt(rfc, timeStep(59 * 1000), 8), '94287082')
    assert.equal(await totpAt(rfc, timeStep(1111111109 * 1000), 8), '07081804')
    assert.equal(await totpAt(rfc, timeStep(1234567890 * 1000), 8), '89005924')
    assert.equal(await totpAt(rfc, timeStep(2000000000 * 1000), 8), '69279037')
  })
  it('accepts the code of now or one step either side, and never one already used', async () => {
    const now = 1_800_000_000_000
    const step = timeStep(now)
    const code = await totpAt(rfc, step)
    assert.equal(await matchTotp(rfc, code, now, null), step)
    assert.equal(await matchTotp(rfc, ` ${code.slice(0, 3)} ${code.slice(3)} `, now, null), step, 'spaces are fine')
    assert.equal(await matchTotp(rfc, await totpAt(rfc, step - 1), now, null), step - 1)
    assert.equal(await matchTotp(rfc, await totpAt(rfc, step - 3), now, null), null, 'too old')
    assert.equal(await matchTotp(rfc, code, now, step), null, 'already used')
    assert.equal(await alreadyUsedTotp(rfc, code, now, step), true)
    assert.equal(await alreadyUsedTotp(rfc, code, now, step - 1), false, 'not used yet')
    assert.equal(await alreadyUsedTotp(rfc, '000000', now, step), code === '000000')
    assert.equal(await matchTotp(rfc, '12345', now, null), null)
  })
  it('keeps the secret encrypted, and refuses a changed one', async () => {
    const secret = newSecret()
    assert.equal(base32Decode(secret)?.length, 20)
    const sealed = await sealSecret(secret)
    assert.match(sealed, /^v1\./)
    assert.ok(!sealed.includes(secret))
    assert.equal(await openSecret(sealed), secret)
    assert.equal(await openSecret(sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')), null)
    assert.equal(await openSecret('nonsense'), null)
    assert.match(otpauthUri('Yalla Haul', 'owner@example.com', secret), /^otpauth:\/\/totp\/Yalla%20Haul:owner%40example\.com\?secret=[A-Z2-7]+&issuer=Yalla%20Haul&algorithm=SHA1&digits=6&period=30$/)
  })
  it('makes backup codes that work typed in any case, each matched to its own hash', async () => {
    const codes = newBackupCodes()
    assert.equal(codes.length, 10)
    for (const c of codes) assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}$/)
    assert.equal(new Set(codes).size, 10)
    const hashes = await Promise.all(codes.map(hashBackupCode))
    assert.equal(await matchBackupCode(codes[3].toUpperCase().replace('-', ' '), hashes), hashes[3])
    assert.equal(await matchBackupCode('aaaa-aaaa', hashes), '')
    assert.equal(await matchBackupCode('123456', hashes), '', 'a 6-digit app code is not a backup code')
  })
})

describe('barcode stickers', () => {
  it('encodes letters in set B and long digit runs in set C, with the right check symbol', () => {
    assert.deepEqual(code128Values('ABC'), [104, 33, 34, 35, 1])
    assert.deepEqual(code128Values('123456'), [105, 12, 34, 56, 44])
    const mixed = code128Values('SKU-12345')
    assert.deepEqual(mixed.slice(0, -1), [104, 51, 43, 53, 13, 99, 12, 34, 100, 21])
    const check = mixed.slice(0, -1).reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103
    assert.equal(mixed.at(-1), check)
  })
  it('draws 11 modules per symbol, 13 for the stop, with quiet zones', () => {
    const { bars, width } = code128Bars('ABC')
    assert.equal(width, 10 + 5 * 11 + 13 + 10)
    assert.equal(bars[0][0], 10)
    assert.ok(bars.every(([, w]) => w >= 1 && w <= 4))
  })
  it('refuses codes a barcode cannot hold, and pages the stickers', () => {
    assert.equal(canEncode('SKU-001'), true)
    assert.equal(canEncode('صابون'), false)
    assert.equal(canEncode(''), false)
    assert.equal(labelPages(Array.from({ length: 50 }, (_, i) => i), 'a4_24').map(p => p.length).join(','), '24,24,2')
    assert.equal(labelPages([1, 2], 'roll_50x30').length, 2)
    assert.ok(moduleWidthMm('SKU-001', 'a4_24') > 0.25)
    assert.ok(moduleWidthMm('A-VERY-LONG-PRODUCT-CODE-123', 'a4_40') < 0.25)
    assert.equal(LABEL_LAYOUTS.a4_24.cols * LABEL_LAYOUTS.a4_24.w, 210)
  })
})

describe('change many prices', () => {
  const change = (c: Partial<PriceChange>): PriceChange => ({ mode: 'up-percent', value: 10, rounding: 'none', compareAt: 'keep', ...c })
  it('raises, lowers and rounds', () => {
    assert.equal(newPrice(1250, change({})), 1375)
    assert.equal(newPrice(1250, change({ rounding: 'whole' })), 1400)
    assert.equal(newPrice(1250, change({ rounding: 'ninety-nine' })), 1399)
    assert.equal(newPrice(1250, change({ mode: 'down-amount', value: 250 })), 1000)
    assert.equal(newPrice(1250, change({ mode: 'set', value: 999 })), 999)
    assert.equal(roundPrice(1230, 'ninety-nine'), 1199)
    assert.equal(roundPrice(40, 'whole'), 100, 'never rounds down to free')
  })
  it('keeps, moves or removes the crossed-out price, never one at or under the new price', () => {
    assert.equal(newCompareAt(2000, 1375, change({})), 2000)
    assert.equal(newCompareAt(2000, 1375, change({ compareAt: 'same' })), 2200)
    assert.equal(newCompareAt(2000, 1375, change({ compareAt: 'remove' })), null)
    assert.equal(newCompareAt(1300, 1375, change({})), null)
  })
  it('flags prices under cost or at zero, and refuses nonsense', () => {
    const rows = previewPrices([
      { kind: 'product', id: 'a', productId: 'a', name: 'Soap', variant: '', price: 1000, compareAt: null, cost: 800 },
      { kind: 'product', id: 'b', productId: 'b', name: 'Towel', variant: '', price: 200, compareAt: null, cost: null },
    ], change({ mode: 'down-amount', value: 300 }))
    assert.equal(rows[0].newPrice, 700)
    assert.equal(rows[0].belowCost, true)
    assert.match(rows[1].problem, /zero/)
    assert.match(changeError(change({ mode: 'down-percent', value: 100 })), /free/)
    assert.match(changeError(change({ value: 0 })), /how much/)
    assert.equal(changeError(change({})), '')
  })
})

describe('profit per product', () => {
  const base = { status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'COD', currency: 'USD', taxTotal: 0, refunded: 0 }
  it('shares discounts between lines, leaves out delivery, and counts free gifts as cost only', () => {
    const orders: ProfitOrder[] = [
      { ...base, grandTotal: 9000 + 300, shippingTotal: 300, discountTotal: 1000, items: [{ productId: 'soap', name: 'Soap', quantity: 2, totalPrice: 4000 }, { productId: 'towel', name: 'Towel', quantity: 1, totalPrice: 6000 }, { productId: 'gift', name: 'Gift', quantity: 1, totalPrice: 0 }] },
      { ...base, status: 'CANCELLED', grandTotal: 5000, shippingTotal: 0, discountTotal: 0, items: [{ productId: 'soap', name: 'Soap', quantity: 5, totalPrice: 5000 }] },
    ]
    const r = computeProfit(orders, new Map([['soap', 1000], ['towel', 5800], ['gift', 300]]), { deliveryCostPerOrder: null, packagingCostPerOrder: null }, [], 'USD')
    const by = Object.fromEntries(r.byProduct.map(p => [p.productId, p]))
    assert.equal(by.soap.sales, 3600, '4000 of 10000 in goods, after the 10% discount')
    assert.equal(by.soap.units, 2, 'the cancelled order is not counted')
    assert.equal(by.soap.profit, 1600)
    assert.equal(by.soap.margin, 44.4)
    assert.equal(by.towel.profit, 5400 - 5800)
    assert.equal(by.gift.freeUnits, 1)
    assert.equal(by.gift.profit, -300)
    assert.deepEqual(r.byProduct.map(p => p.productId), ['soap', 'gift', 'towel'])
  })
  it('says so when a cost is missing instead of guessing', () => {
    const r = computeProfit([{ ...base, grandTotal: 1000, shippingTotal: 0, discountTotal: 0, items: [{ productId: 'cup', name: 'Cup', quantity: 1, totalPrice: 1000 }] }], new Map(), { deliveryCostPerOrder: null, packagingCostPerOrder: null }, [], 'USD')
    assert.equal(r.byProduct[0].cost, null)
    assert.equal(r.byProduct[0].profit, null)
    assert.equal(r.byProduct[0].sales, 1000)
  })
})

describe('occasions', () => {
  const mothers = { id: 'm', name: 'Mother\'s Day', nameAr: '', date: '2027-03-21', orderBy: '2027-03-19', showFrom: '2027-03-05', link: '/collections/gifts' }
  it('checks the dates', () => {
    assert.equal(occasionError(mothers), '')
    assert.match(occasionError({ ...mothers, orderBy: '2027-03-22' }), /on or before/)
    assert.match(occasionError({ ...mothers, showFrom: '2027-03-20' }), /start showing before/)
    assert.match(occasionError({ ...mothers, date: '2027-02-30' }), /day of the occasion/)
    assert.equal(cleanLink('https://evil.example'), '')
    assert.equal(cleanLink('//evil.example'), '')
    assert.equal(cleanLink('/shop'), '/shop')
  })
  it('shows one between its dates only, the soonest first', () => {
    const fathers = { ...mothers, id: 'f', name: 'Father\'s Day', date: '2027-03-25', orderBy: '2027-03-23', showFrom: '2027-03-01' }
    const list = readOccasions(JSON.stringify([fathers, mothers, { ...mothers, id: 'bad', orderBy: 'soon' }]))
    assert.equal(list.length, 2)
    assert.equal(activeOccasion(list, '2027-03-04')?.id, 'f')
    assert.equal(activeOccasion(list, '2027-03-10')?.id, 'm')
    assert.equal(activeOccasion(list, '2027-03-19')?.id, 'm', 'the last day to order still shows')
    assert.equal(activeOccasion(list, '2027-03-20')?.id, 'f')
    assert.equal(activeOccasion(list, '2027-03-24'), null)
    assert.deepEqual(upcomingOccasions(list, '2027-03-20').map(o => o.id), ['f'])
  })
  it('fills the next date for fixed occasions', () => {
    assert.equal(nextFixedDate(3, 21, '2026-10-16'), '2027-03-21')
    assert.equal(nextFixedDate(12, 25, '2026-10-16'), '2026-12-25')
    assert.deepEqual(defaultsFor('2026-12-25'), { orderBy: '2026-12-23', showFrom: '2026-12-09' })
  })
})

describe('suppliers', () => {
  it('keeps one entry per name and matches them whatever the capitals', () => {
    const list = readSuppliers(JSON.stringify([{ name: ' Khoury  Trading ', phone: '+961 70 123 456' }, { name: 'khoury trading', phone: '1' }, { name: '' }, { name: 'Abou Ali' }]))
    assert.deepEqual(list.map(s => s.name), ['Khoury Trading', 'Abou Ali'])
    assert.equal(list[0].phone, '96170123456')
    assert.deepEqual(supplierPhones(list), { [supplierKey('KHOURY TRADING')]: '96170123456' })
  })
})

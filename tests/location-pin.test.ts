import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { addressWithPin, cleanPin, pinFitsCountry, pinMapUrl } from '@/lib/location-pin'
import { driverMessage, mapLabel, mapsLink, orderPin } from '@/lib/order-flow'
import { driverRunMessage } from '@/lib/delivery-sheet'
import { checkoutSchema } from '@/lib/validation'

const read = (path: string) => readFileSync(path, 'utf8')
const beirut = { lat: 33.89377, lng: 35.50178 }
const address = { firstName: 'Rana', lastName: 'Haddad', line1: 'Hamra street', city: 'Beirut', country: 'Lebanon', phone: '70123456' }
const order = (extra: Record<string, unknown> = {}) => ({ orderNumber: '1001', status: 'PROCESSING', paymentStatus: 'UNPAID', paymentMethod: 'COD', grandTotal: 2000, currency: 'USD', shippingAddressJson: JSON.stringify({ ...address, ...extra }), items: [{ name: 'Soap', quantity: 1 }] })
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

describe('share my exact location: what counts as a real pin', () => {
  it('keeps a real position, rounded to about a metre, with how accurate it is', () => {
    assert.deepEqual(cleanPin({ lat: 33.8937712345, lng: 35.5017812345, accuracy: 12.4 }), { lat: 33.89377, lng: 35.50178, accuracy: 12 })
    assert.deepEqual(cleanPin({ lat: '33.89377', lng: '35.50178' }), { ...beirut, accuracy: null })
  })

  it('ignores a missing, broken or empty position', () => {
    for (const bad of [null, undefined, {}, { lat: 33.9 }, { lat: 'x', lng: 'y' }, { lat: NaN, lng: 35 }, { lat: 95, lng: 35 }, { lat: 33, lng: 200 }, { lat: 0, lng: 0 }, { lat: '', lng: '' }]) {
      assert.equal(cleanPin(bad as never), null, JSON.stringify(bad))
    }
  })

  it('a nonsense accuracy is dropped, the position stays', () => {
    assert.equal(cleanPin({ ...beirut, accuracy: -5 })?.accuracy, null)
    assert.equal(cleanPin({ ...beirut, accuracy: 9e9 })?.accuracy, null)
  })

  it('a pin outside Lebanon does not count for a Lebanon order (e.g. someone abroad ordering for family)', () => {
    assert.equal(pinFitsCountry(cleanPin(beirut)!, 'LB'), true)
    assert.equal(pinFitsCountry({ lat: 48.8566, lng: 2.3522, accuracy: null }, 'LB'), false)
    assert.equal(pinFitsCountry({ lat: 48.8566, lng: 2.3522, accuracy: null }, 'FR'), true) // countries without a check keep the pin
  })
})

describe('share my exact location: what is saved with the order', () => {
  it('keeps the pin next to the address when it is real and in the country', () => {
    const saved = addressWithPin({ ...address, ...beirut, locationAccuracy: 8.6 }, 'LB')
    assert.equal(saved.lat, 33.89377)
    assert.equal(saved.lng, 35.50178)
    assert.equal(saved.locationAccuracy, 9)
    assert.equal(saved.line1, 'Hamra street')
  })

  it('removes it when it is abroad, broken, or not given', () => {
    for (const a of [{ ...address, lat: 48.85, lng: 2.35 }, { ...address, lat: 99, lng: 1 }, { ...address, lat: 33.9 }, address]) {
      const saved = addressWithPin(a as Record<string, unknown>, 'LB')
      assert.equal('lat' in saved, false)
      assert.equal('lng' in saved, false)
      assert.equal('locationAccuracy' in saved, false)
      assert.equal(saved.line1, 'Hamra street')
    }
  })

  it('the checkout form accepts a pin, and refuses a position that is not on Earth', () => {
    const base = { paymentMethod: 'COD', items: [{ productId: 'p1', quantity: 1 }] }
    const ok = checkoutSchema.parse({ ...base, shippingAddress: { ...address, ...beirut, locationAccuracy: 20 } })
    assert.equal(ok.shippingAddress.lat, 33.89377)
    assert.equal(checkoutSchema.safeParse({ ...base, shippingAddress: { ...address, lat: 123, lng: 35 } }).success, false)
    assert.equal(checkoutSchema.safeParse({ ...base, shippingAddress: { ...address, lat: 'north', lng: 35 } }).success, false)
    assert.equal(checkoutSchema.parse({ ...base, shippingAddress: address }).shippingAddress.lat, undefined)
  })
})

describe('share my exact location: where the driver sees it', () => {
  it('the map button opens the exact spot when there is a pin, and searches the address when there is not', () => {
    assert.equal(mapsLink(order(beirut)), pinMapUrl(beirut))
    assert.equal(mapsLink(order(beirut)), 'https://www.google.com/maps/search/?api=1&query=33.89377,35.50178')
    assert.match(mapsLink(order()), /query=Hamra%20street/)
    assert.deepEqual(orderPin(order(beirut)), { ...beirut, accuracy: null })
    assert.equal(orderPin(order()), null)
  })

  it('an old order whose address is plain text, or has a broken pin, still opens the typed address', () => {
    assert.match(mapsLink({ shippingAddressJson: 'Hamra street, Beirut' }), /query=Hamra%20street/)
    assert.match(mapsLink(order({ lat: 'oops', lng: 35 })), /query=Hamra%20street/)
  })

  it('the message for the driver and the delivery list say "Exact location" only when they have one', () => {
    assert.equal(mapLabel(order(beirut)), 'Exact location')
    assert.equal(mapLabel(order()), 'Map')
    assert.match(driverMessage(order(beirut) as never, 'Yalla Haul', fmt), /Exact location: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=33\.89377,35\.50178/)
    assert.match(driverMessage(order() as never, 'Yalla Haul', fmt), /Map: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Hamra/)
    assert.match(driverRunMessage([order(beirut) as never], 'Yalla Haul', 'today', fmt as never), /Exact location: https/)
  })
})

describe('share my exact location: how it is wired', () => {
  it('is only asked for when the customer taps the button, and the position is never shown to other people', () => {
    const box = read('app/checkout/location-pin.tsx')
    assert.match(box, /onClick=\{ask\}/)
    assert.equal((box.match(/getCurrentPosition/g) || []).length, 1)
    assert.doesNotMatch(box, /watchPosition/)
    assert.doesNotMatch(read('app/order/success/page.tsx') + read('app/account/orders/[orderNumber]/page.tsx'), /\.lat\b|\.lng\b|pinMapUrl|orderPin/)
  })

  it('checkout sends it with the address and the server checks it again before saving', () => {
    assert.match(read('app/checkout/page.tsx'), /<LocationPinButton pin=\{pin\} onChange=\{setPin\}/)
    assert.match(read('app/checkout/page.tsx'), /lat: pin\.lat, lng: pin\.lng/)
    assert.match(read('app/api/checkout/route.ts'), /input\.shippingAddress = addressWithPin\(input\.shippingAddress, countryCode\(input\.shippingAddress\.country\)\)/)
  })

  it('the order page, the driver page and the delivery sheet label the button', () => {
    for (const path of ['components/order-detail-admin.tsx', 'components/driver-run.tsx', 'components/delivery-sheet.tsx']) assert.match(read(path), /orderPin\(/, path)
  })
})

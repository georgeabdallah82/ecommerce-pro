import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddressParts } from '@/components/address-parts'
import { addressLines, addressParts } from '@/lib/order-flow'

// Arabic addresses on the admin order page, the delivery sheet and the driver's page (docs/prelaunch-check-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('an address on one line', () => {
  it('keeps each part in its own direction, so an Arabic street next to "Beirut, Lebanon" is not scrambled', () => {
    assert.equal(renderToStaticMarkup(createElement(AddressParts, { lines: ['شارع البحر 5', 'جونية', 'Beirut', 'Lebanon'], empty: 'No address' })), '<bdi>شارع البحر 5</bdi>, <bdi>جونية</bdi>, <bdi>Beirut</bdi>, <bdi>Lebanon</bdi>')
    assert.equal(renderToStaticMarkup(createElement(AddressParts, { lines: [], empty: 'No address' })), 'No address')
  })
  it('keeps the city and the region apart on screen, so an Arabic city next to an English region stays in place', () => {
    const order = { shippingAddressJson: JSON.stringify({ line1: 'شارع البحر 5', line2: '', city: 'جونية', region: 'Beirut', country: 'Lebanon' }) }
    assert.deepEqual(addressParts(order), ['شارع البحر 5', 'جونية', 'Beirut', 'Lebanon'])
    // Printed and copied addresses keep "city, region" on one line.
    assert.deepEqual(addressLines(order), ['شارع البحر 5', 'جونية, Beirut', 'Lebanon'])
  })
  it('is how the admin order page, the delivery sheet and the driver page show it', () => {
    assert.match(read('components/order-detail-admin.tsx'), /<AddressParts lines=\{addressParts\(o\)\} empty="No delivery address" \/>/)
    assert.match(read('components/delivery-sheet.tsx'), /<AddressParts lines=\{addressParts\(order\)\} empty="No address" \/>/)
    assert.match(read('components/driver-run.tsx'), /<AddressParts lines=\{addressParts\(order\)\} empty="No address: call the customer" \/>/)
    for (const path of ['components/order-detail-admin.tsx', 'components/delivery-sheet.tsx', 'components/driver-run.tsx']) assert.doesNotMatch(read(path), /addressLines\([^)]*\)\.join\(', '\)|lines\.join\(', '\) :/, path)
  })
})

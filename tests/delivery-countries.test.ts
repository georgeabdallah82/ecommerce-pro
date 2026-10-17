import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REGION_CODES, countryCode, countryName, deliveryCountries, deliveryCountryOptions } from '@/lib/delivery-countries'

describe('countries the store delivers to', () => {
  it('reads countries however they were typed or saved', () => {
    assert.equal(countryCode('Lebanon'), 'LB')
    assert.equal(countryCode(' lb '), 'LB')
    assert.equal(countryCode('UAE'), 'AE')
    assert.equal(countryCode('United Arab Emirates'), 'AE')
    assert.equal(countryCode('Peru'), 'PE', 'found by its English name, not only the short alias list')
    assert.equal(countryCode('Atlantis'), '')
    assert.equal(countryCode('ZZ'), '')
    assert.equal(countryCode(''), '')
  })
  it('defaults to the store country, and keeps it first', () => {
    assert.deepEqual(deliveryCountries(null, 'Lebanon'), ['LB'])
    assert.deepEqual(deliveryCountries('', 'Lebanon'), ['LB'])
    assert.deepEqual(deliveryCountries('not json', 'Lebanon'), ['LB'])
    assert.deepEqual(deliveryCountries('["AE","LB","AE","xx"]', 'Lebanon'), ['LB', 'AE'])
    assert.deepEqual(deliveryCountries('["FR"]', 'Lebanon'), ['FR'], 'a store may stop delivering to its own country')
  })
  it('names countries in English and Arabic', () => {
    assert.equal(countryName('LB'), 'Lebanon')
    assert.equal(countryName('LB', 'ar'), 'لبنان')
    assert.deepEqual(deliveryCountryOptions(['LB', 'AE']), [{ code: 'LB', name: 'Lebanon' }, { code: 'AE', name: 'United Arab Emirates' }])
    assert.ok(REGION_CODES.every(code => countryCode(countryName(code)) === code), 'every listed country reads back to its own code')
  })
})

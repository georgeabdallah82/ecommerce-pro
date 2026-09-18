import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_ADDRESSES_PER_USER, sanitizeAddressInput } from '@/lib/addresses'

const valid = {
  label: 'Home',
  firstName: 'Jane',
  lastName: 'Doe',
  line1: '123 Main St',
  line2: 'Apt 4',
  city: 'Beirut',
  region: 'Beirut',
  postalCode: '1100',
  country: 'Lebanon',
  phone: '+96170000000',
  isDefault: true,
}

describe('lib/addresses', () => {
  describe('sanitizeAddressInput', () => {
    it('accepts a fully-populated valid address', () => {
      const result = sanitizeAddressInput(valid)
      assert.ok(result)
      assert.equal(result?.firstName, 'Jane')
      assert.equal(result?.isDefault, true)
    })

    it('rejects a missing required field', () => {
      const requiredKeys: (keyof typeof valid)[] = ['firstName', 'lastName', 'line1', 'city', 'country']
      for (const key of requiredKeys) {
        const { [key]: _omit, ...rest } = valid
        assert.equal(sanitizeAddressInput(rest), null, `expected null when ${key} is missing`)
      }
    })

    it('rejects a blank-string required field', () => {
      assert.equal(sanitizeAddressInput({ ...valid, firstName: '   ' }), null)
    })

    it('treats optional fields as null when absent', () => {
      const minimal = { firstName: 'Jane', lastName: 'Doe', line1: '123 Main St', city: 'Beirut', country: 'Lebanon' }
      const result = sanitizeAddressInput(minimal)
      assert.ok(result)
      assert.equal(result?.label, null)
      assert.equal(result?.line2, null)
      assert.equal(result?.region, null)
      assert.equal(result?.postalCode, null)
      assert.equal(result?.phone, null)
      assert.equal(result?.isDefault, false)
    })

    it('trims and caps overly long field values', () => {
      const result = sanitizeAddressInput({ ...valid, firstName: `  ${'a'.repeat(200)}  ` })
      assert.ok(result)
      assert.equal(result?.firstName.length, 80)
      assert.equal(result?.firstName.startsWith(' '), false)
    })

    it('rejects a non-object body', () => {
      assert.equal(sanitizeAddressInput(null), null)
      assert.equal(sanitizeAddressInput('not an object'), null)
      assert.equal(sanitizeAddressInput([valid]), null)
    })
  })

  it('caps the number of addresses a customer can save', () => {
    assert.equal(MAX_ADDRESSES_PER_USER, 20)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanStaffName, MAX_AVATAR_BYTES } from '../lib/staff-profile'

describe('staff profile name', () => {
  it('trims the name and collapses inner spaces', () => {
    assert.deepEqual(cleanStaffName('  Layla    Haddad  '), { name: 'Layla Haddad' })
  })

  it('accepts names in any script', () => {
    assert.deepEqual(cleanStaffName('ليلى حداد'), { name: 'ليلى حداد' })
  })

  it('rejects a name shorter than two letters', () => {
    assert.ok('error' in cleanStaffName(' A '))
    assert.ok('error' in cleanStaffName(''))
    assert.ok('error' in cleanStaffName(undefined))
  })

  it('rejects a name over 80 characters', () => {
    assert.ok('error' in cleanStaffName('x'.repeat(81)))
    assert.deepEqual(cleanStaffName('x'.repeat(80)), { name: 'x'.repeat(80) })
  })

  it('rejects control characters and angle brackets', () => {
    assert.ok('error' in cleanStaffName('Layla\u0007'))
    assert.ok('error' in cleanStaffName('<b>Layla</b>'))
  })

  it('caps photos at 2 MB', () => {
    assert.equal(MAX_AVATAR_BYTES, 2 * 1024 * 1024)
  })
})

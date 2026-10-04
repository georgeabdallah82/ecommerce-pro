import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isBlocked, parseBlockedPhones } from '@/lib/blocked-phones'

describe('blocked phone numbers', () => {
  const list = parseBlockedPhones(JSON.stringify([{ phone: '96170123456', note: 'Refused 3 times', blockedAt: '2026-10-01' }, { nope: true }]))
  it('reads the saved list and ignores junk', () => {
    assert.deepEqual(list, [{ phone: '96170123456', note: 'Refused 3 times', blockedAt: '2026-10-01' }])
    assert.deepEqual(parseBlockedPhones('not json'), [])
    assert.deepEqual(parseBlockedPhones(null), [])
  })
  it('matches the number however it is typed, on either phone field', () => {
    for (const typed of ['70 123 456', '+961 70 123 456', '0096170123456', '070-123-456']) assert.equal(isBlocked(list, [typed], 'Lebanon'), true, typed)
    assert.equal(isBlocked(list, ['', '70123456'], 'Lebanon'), true)
    assert.equal(isBlocked(list, ['71 123 456', null], 'Lebanon'), false)
    assert.equal(isBlocked([], ['70 123 456'], 'Lebanon'), false)
  })
})

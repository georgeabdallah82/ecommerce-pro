import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSessionRevoked } from '@/lib/auth'

describe('isSessionRevoked', () => {
  const revokedAt = new Date('2026-10-02T12:00:00.750Z')
  const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

  it('keeps sessions valid when nothing was revoked (logins, wallet/coin updates no longer count)', () => {
    assert.equal(isSessionRevoked(seconds('2026-01-01T00:00:00Z'), null), false)
    assert.equal(isSessionRevoked(seconds('2026-01-01T00:00:00Z'), undefined), false)
  })
  it('rejects tokens issued before a password/email/role change', () => {
    assert.equal(isSessionRevoked(seconds('2026-10-02T11:59:59Z'), revokedAt), true)
  })
  it('accepts tokens issued at or after the revocation (second precision)', () => {
    assert.equal(isSessionRevoked(seconds('2026-10-02T12:00:00Z'), revokedAt), false)
    assert.equal(isSessionRevoked(seconds('2026-10-02T12:05:00Z'), revokedAt), false)
  })
})

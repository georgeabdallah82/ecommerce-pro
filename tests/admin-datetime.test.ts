import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatAdminDate, formatAdminDateTime, DEFAULT_STORE_TIMEZONE } from '@/lib/admin-datetime'

describe('lib/admin-datetime formatAdminDateTime', () => {
  it('formats a date in the given IANA timezone, not the host/browser timezone', () => {
    // 2026-01-01T00:30:00Z is already Jan 1 in Beirut (UTC+2/+3) but still Dec 31 in New York (UTC-5).
    const iso = '2026-01-01T00:30:00.000Z'
    const beirut = formatAdminDateTime(iso, 'Asia/Beirut', { year: 'numeric', month: 'short', day: 'numeric' })
    const newYork = formatAdminDateTime(iso, 'America/New_York', { year: 'numeric', month: 'short', day: 'numeric' })
    assert.match(beirut, /Jan 1, 2026/)
    assert.match(newYork, /Dec 31, 2025/)
  })

  it('falls back to the default store timezone when none is given', () => {
    const withDefault = formatAdminDateTime('2026-01-01T00:30:00.000Z', undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    const explicit = formatAdminDateTime('2026-01-01T00:30:00.000Z', DEFAULT_STORE_TIMEZONE, { year: 'numeric', month: 'short', day: 'numeric' })
    assert.equal(withDefault, explicit)
  })

  it('returns an em dash for a null, undefined, or invalid value instead of throwing', () => {
    assert.equal(formatAdminDateTime(null), '—')
    assert.equal(formatAdminDateTime(undefined), '—')
    assert.equal(formatAdminDateTime('not-a-real-date'), '—')
  })

  it('degrades to a readable string rather than throwing on a bogus timezone string', () => {
    const result = formatAdminDateTime('2026-01-01T00:30:00.000Z', 'Not/A_Real_Zone')
    assert.equal(typeof result, 'string')
    assert.notEqual(result, '—')
  })
})

describe('lib/admin-datetime formatAdminDate', () => {
  it('formats a date-only string (no time component)', () => {
    const result = formatAdminDate('2026-06-15T12:00:00.000Z', 'UTC')
    assert.match(result, /Jun 15, 2026/)
    assert.doesNotMatch(result, /:\d{2}/)
  })
})

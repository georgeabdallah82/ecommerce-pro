import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { DRIVER_LINK_DAYS, driverLinkExpiry } from '@/lib/drivers'

const read = (path: string) => readFileSync(path, 'utf8')
const DAY = 24 * 60 * 60 * 1000

describe('driver links expire', () => {
  it('a new link lasts DRIVER_LINK_DAYS', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    assert.equal(driverLinkExpiry(now).getTime() - now.getTime(), DRIVER_LINK_DAYS * DAY)
    assert.equal(DRIVER_LINK_DAYS, 90)
  })
  it('only an unexpired link is accepted, and creating or renewing sets an expiry', () => {
    assert.match(read('lib/drivers.ts'), /tokenExpiresAt: \{ gt: new Date\(\) \}/)
    const route = read('app/api/admin/drivers/route.ts')
    assert.match(route, /tokenExpiresAt: driverLinkExpiry\(\)/)
    assert.match(route, /data\.token = newDriverToken\(\); data\.tokenExpiresAt = driverLinkExpiry\(\)/)
  })
  it('existing links get an expiry in the migration', () => {
    const sql = read('prisma/migrations/20261112000000_driver_link_expiry/migration.sql')
    assert.match(sql, /ADD COLUMN "tokenExpiresAt"/)
    assert.match(sql, /SET "tokenExpiresAt" = CURRENT_TIMESTAMP \+ INTERVAL '90 days' WHERE "tokenExpiresAt" IS NULL/)
  })
})

describe('the Meta conversions token is sealed', () => {
  it('is sealed when saved and opened when read', () => {
    const settings = read('app/api/admin/settings/route.ts')
    assert.match(settings, /SECRET_KEYS\.has\(key\) && value \? sealSecret\(value\)/)
    const meta = read('lib/meta-capi.ts')
    assert.match(meta, /storedToken\.startsWith\('v1\.'\) \? \(\(await openSecret\(storedToken\)\) \|\| ''\) : storedToken/)
  })
  it('older plain tokens are sealed by the daily job', () => {
    assert.match(read('lib/secret-settings.ts'), /row\.value\.startsWith\('v1\.'\)/)
    assert.match(read('app/api/internal/daily/route.ts'), /sealPlainSecrets\(\)/)
  })
})

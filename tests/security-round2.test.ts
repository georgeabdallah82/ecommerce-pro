import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { imageHostAllowed, PROXY_IMAGE_HOSTS } from '@/lib/image-hosts'

const read = (path: string) => readFileSync(path, 'utf8')

describe('image proxy host list', () => {
  const own = 'yallahaul.com'
  it('allows the store itself and the listed hosts (and their subdomains)', () => {
    assert.ok(imageHostAllowed('yallahaul.com', own))
    assert.ok(imageHostAllowed('drive.google.com', own))
    assert.ok(imageHostAllowed('www.dropbox.com', own))
    assert.ok(imageHostAllowed('dl.dropboxusercontent.com', own))
    assert.ok(imageHostAllowed('images.unsplash.com', own))
    assert.ok(imageHostAllowed('IMAGES.UNSPLASH.COM', own))
    assert.ok(imageHostAllowed('media.yallahaul.com', own))
    assert.equal(imageHostAllowed('evil-media.yallahaul.com.example', own), false)
  })
  it('refuses every other host, including look-alikes', () => {
    assert.equal(imageHostAllowed('evil.example.com', own), false)
    assert.equal(imageHostAllowed('unsplash.com.evil.example', own), false)
    assert.equal(imageHostAllowed('notdropbox.com', own), false)
    assert.equal(imageHostAllowed('169.254.169.254', own), false)
  })
  it('the proxy checks every hop, including redirects', () => {
    const source = read('app/api/image-proxy/route.ts')
    assert.match(source, /imageHostAllowed\(parsed\.hostname, ownHost\)/)
    assert.match(source, /if\(!imageHostAllowed\(parsed\.hostname,new URL\(req\.url\)\.hostname\)\) return new NextResponse\('Image host not allowed',\{status:403/)
    assert.ok(PROXY_IMAGE_HOSTS.length >= 4)
  })
})

describe('email verification', () => {
  it('a sign-up never reveals whether the email exists, and signs no one in', () => {
    const source = read('app/account/register/server.ts')
    assert.match(source, /if \(existing\) \{[\s\S]*sendAlreadyRegisteredEmail[\s\S]*redirect\('\/account\/check-email'\)/)
    assert.doesNotMatch(source, /setSession/)
    assert.doesNotMatch(source, /error=exists/)
  })
  it('an unconfirmed account cannot sign in until its link is used', () => {
    assert.match(read('app/account/login/server.ts'), /if \(!user\.emailVerifiedAt\) redirect\('\/account\/check-email\?error=unverified'\)/)
  })
  it('the link is stored as a hash, used once, and expires', () => {
    const lib = read('lib/email-verification.ts')
    assert.match(lib, /createHash\('sha256'\)/)
    assert.match(lib, /deleteMany\(\{ where: \{ id: row\.id, expiresAt: \{ gt: now \} \} \}\)/)
    assert.match(lib, /if \(!row \|\| row\.expiresAt <= now\) return null/)
  })
  it('existing accounts are confirmed by the migration, and admin-made accounts are confirmed on creation', () => {
    assert.match(read('prisma/migrations/20261114000000_email_verification/migration.sql'), /UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL/)
    assert.match(read('app/api/admin/customers/route.ts'), /emailVerifiedAt: new Date\(\)/)
    assert.match(read('app/api/admin/users/route.ts'), /emailVerifiedAt: new Date\(\)/)
  })
})

describe('point-of-sale leftovers', () => {
  it('the removal drops only what the reverted work added, and checks existence first', () => {
    const sql = read('prisma/migrations/20261113000000_remove_pos_erp_leftovers/migration.sql')
    for (const table of ['PaymentLine', 'CashMovement', 'CashierShift', 'Register', 'Supplier']) assert.match(sql, new RegExp(`DROP TABLE IF EXISTS "${table}"`))
    assert.doesNotMatch(sql, /DROP TABLE IF EXISTS "(Order|OrderItem|ReturnRequest|PurchaseOrder|User|Product)"/)
    assert.doesNotMatch(sql, /CASCADE/)
  })
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import bcrypt from 'bcryptjs'
import { hashPassword, passwordHashOutdated, verifyPassword } from '@/lib/auth'

// Backend bug fixes (docs/backend-bug-fixes-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('passwords: native scrypt instead of bcryptjs', () => {
  it('hashes with scrypt, a new salt each time, and checks it', async () => {
    const hash = await hashPassword('correct horse battery')
    assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/)
    assert.equal(await verifyPassword('correct horse battery', hash), true)
    assert.equal(await verifyPassword('correct horse batterz', hash), false)
    assert.notEqual(await hashPassword('correct horse battery'), hash)
    assert.equal(passwordHashOutdated(hash), false)
  })
  it('older bcryptjs hashes still sign in, and are marked for an upgrade', async () => {
    const legacy = bcrypt.hashSync('old password', 4)
    assert.equal(await verifyPassword('old password', legacy), true)
    assert.equal(await verifyPassword('wrong', legacy), false)
    assert.equal(passwordHashOutdated(legacy), true)
  })
  it('refuses settings it could not have written, without running them', async () => {
    const [, , , , salt, key] = (await hashPassword('pw')).split('$')
    for (const bad of [`scrypt$1048576$8$1$${salt}$${key}`, `scrypt$16384$64$1$${salt}$${key}`, `scrypt$16383$8$1$${salt}$${key}`, `scrypt$16384$8$9$${salt}$${key}`, 'scrypt$16384$8$1$x', '', 'plain']) {
      assert.equal(await verifyPassword('pw', bad), false, bad)
    }
  })
  it('each sign-in upgrades an older hash; customers made by staff use the same hashing', () => {
    for (const file of ['app/account/login/server.ts', 'app/api/admin/login/route.ts']) assert.match(read(file), /await upgradePasswordHash\(user\.id, password, user\.passwordHash\)/, file)
    assert.match(read('app/api/admin/reauth/route.ts'), /if \(password\) await upgradePasswordHash\(user\.id, password, user\.passwordHash\)/)
    const customers = read('app/api/admin/customers/route.ts')
    assert.doesNotMatch(customers, /bcrypt/)
    assert.match(customers, /await hashPassword\(password \|\| /)
  })
})

describe('card checkouts left at the payment page give their stock back', () => {
  it('the Worker runs the release job at the top of each hour', () => {
    assert.match(read('worker.ts'), /if \(reconcileDue\(controller\.scheduledTime\)\) paths\.push\('\/api\/internal\/release-expired-reservations'\)/)
  })
  it('the job answers the Worker\'s own POST, and asks the gateway before cancelling', () => {
    const job = read('app/api/internal/release-expired-reservations/route.ts')
    assert.match(job, /export async function POST\(req: Request\) \{\n  if \(!isInternalJobRequest\(req\)\)/)
    assert.doesNotMatch(job, /export async function GET/)
    assert.match(job, /if \(await paidAtGateway\(candidate\)\) \{ paid \+= 1; continue \}/)
    assert.match(job, /await markOnlinePaymentPaid\(order, transaction\.id, 'expiry'\)/)
  })
})

describe('invite codes', () => {
  it('lookups are limited in the database, not in one copy\'s memory', () => {
    const invite = read('app/api/invite/route.ts')
    assert.match(invite, /await consumeDurableRateLimit\(`invite:\$\{clientIp\(req\.headers\)\}`, 30, 10 \* 60 \* 1000\)/)
    assert.doesNotMatch(invite, /consumeRateLimit\(/)
  })
})

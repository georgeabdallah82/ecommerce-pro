import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { REWARDS_DEFAULTS, codeState, normalizeRewardsConfig, rewardCustomers, rewardMessage, rewardsEarned, validateRewardsConfig } from '@/lib/rewards-shared'

const read = (path: string) => readFileSync(path, 'utf8')
const order = (phone: string | null, status = 'DELIVERED', day = 1, name = 'Maya') => ({ status, phone, createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, shippingAddressJson: JSON.stringify({ firstName: name, lastName: 'Haddad', phone }) })
const many = (phone: string, n: number, status = 'DELIVERED') => Array.from({ length: n }, (_, i) => order(phone, status, i + 1))

describe('rewards: the numbers the owner sets', () => {
  it('start switched off with 5 orders, 10% and 60 days', () => assert.deepEqual(REWARDS_DEFAULTS, { enabled: false, everyOrders: 5, percent: 10, days: 60 }))
  it('are read leniently: broken or missing values fall back', () => {
    assert.deepEqual(normalizeRewardsConfig(undefined), REWARDS_DEFAULTS)
    assert.deepEqual(normalizeRewardsConfig('not json'), REWARDS_DEFAULTS)
    assert.deepEqual(normalizeRewardsConfig({ enabled: true, everyOrders: 1, percent: 99, days: 'x' }), { ...REWARDS_DEFAULTS, enabled: true })
    assert.deepEqual(normalizeRewardsConfig(JSON.stringify({ enabled: true, everyOrders: 3, percent: 15, days: 30 })), { enabled: true, everyOrders: 3, percent: 15, days: 30 })
    assert.equal(normalizeRewardsConfig({ enabled: 'true' }).enabled, false) // only a real true switches it on
  })
  it('are checked strictly when saved, with a plain sentence', () => {
    const ok = validateRewardsConfig({ enabled: true, everyOrders: 5, percent: 10, days: 60 })
    assert.ok(ok.ok && ok.value.enabled)
    for (const [bad, pattern] of [[{ everyOrders: 1, percent: 10, days: 60 }, /Orders needed/], [{ everyOrders: 51, percent: 10, days: 60 }, /Orders needed/], [{ everyOrders: 5, percent: 0, days: 60 }, /discount/], [{ everyOrders: 5, percent: 51, days: 60 }, /discount/], [{ everyOrders: 5, percent: 10, days: 3 }, /days/], [{ everyOrders: 5, percent: 10, days: 400 }, /days/], [{ everyOrders: 5.5, percent: 10, days: 60 }, /Orders needed/], [{ everyOrders: 'abc', percent: 10, days: 60 }, /Orders needed/], [null, /Orders needed/]] as const) {
      const r = validateRewardsConfig(bad)
      assert.ok(!r.ok && pattern.test(r.error), JSON.stringify(bad))
    }
    const strings = validateRewardsConfig({ everyOrders: '4', percent: '12', days: '30' })
    assert.ok(strings.ok && strings.value.everyOrders === 4 && !strings.value.enabled)
  })
})

describe('rewards: who has earned one', () => {
  const config = { everyOrders: 5 }
  const run = (orders: ReturnType<typeof order>[], given: Record<string, number> = {}, blocked: string[] = []) => rewardCustomers(orders, new Map(Object.entries(given)), config, { storeCountry: 'Lebanon', blocked: new Set(blocked) })
  it('one reward for every N delivered orders', () => {
    assert.equal(rewardsEarned(4, 5), 0); assert.equal(rewardsEarned(5, 5), 1); assert.equal(rewardsEarned(9, 5), 1); assert.equal(rewardsEarned(10, 5), 2); assert.equal(rewardsEarned(-3, 5), 0)
  })
  it('lists a customer at the number of delivered orders, not before', () => {
    assert.deepEqual(run(many('70 111 222', 4)), [])
    const [c] = run(many('70 111 222', 5))
    assert.deepEqual({ phone: c.phone, delivered: c.delivered, earned: c.earned, given: c.given, due: c.due, next: c.nextMilestone, name: c.name }, { phone: '96170111222', delivered: 5, earned: 1, given: 0, due: 1, next: 1, name: 'Maya Haddad' })
  })
  it('counts only delivered orders: cancelled, refunded and open ones do not', () => {
    assert.deepEqual(run([...many('70 111 222', 4), order('70 111 222', 'CANCELLED'), order('70 111 222', 'SHIPPED'), order('70 111 222', 'PENDING'), order('70 111 222', 'REFUNDED')]), [])
  })
  it('groups one customer however the number was typed', () => {
    const typed = ['70 111 222', '+961 70111222', '0096170111222', '70111222', '70-111-222']
    const [c] = run(typed.map((p, i) => order(p, 'DELIVERED', i + 1)))
    assert.equal(c.delivered, 5); assert.equal(c.phone, '96170111222')
  })
  it('reads the phone from the delivery address when the order has none', () => {
    const noPhone = Array.from({ length: 5 }, (_, i) => ({ ...order(null, 'DELIVERED', i + 1), shippingAddressJson: JSON.stringify({ firstName: 'Rana', phone: '03 123 456' }) }))
    assert.equal(run(noPhone)[0].phone, '9613123456')
  })
  it('never offers the same reward twice, and offers the next one at the next N', () => {
    assert.deepEqual(run(many('70 111 222', 5), { '96170111222': 1 }), [])
    assert.deepEqual(run(many('70 111 222', 9), { '96170111222': 1 }), [])
    const [c] = run(many('70 111 222', 10), { '96170111222': 1 })
    assert.deepEqual({ due: c.due, next: c.nextMilestone }, { due: 1, next: 2 })
    assert.equal(run(many('70 111 222', 15), {})[0].due, 3)
  })
  it('skips blocked numbers and orders with no usable phone, and puts the most orders first', () => {
    assert.deepEqual(run(many('70 111 222', 5), {}, ['96170111222']), [])
    assert.deepEqual(run(many('abc', 5)), [])
    const list = run([...many('70 111 222', 5), ...many('70 333 444', 10)])
    assert.deepEqual(list.map(c => c.phone), ['96170333444', '96170111222'])
  })
})

describe('rewards: the message and the code state', () => {
  it('says what the customer gets, once and for how long', () => {
    const m = rewardMessage({ storeName: 'Yalla Haul', name: 'Maya Haddad', code: 'LOYALK7Q2X', percent: 10, days: 60, delivered: 5, siteUrl: 'https://yallahaul.com' })
    assert.match(m, /^Hi Maya!/); assert.match(m, /Yalla Haul/); assert.match(m, /5 orders/); assert.match(m, /LOYALK7Q2X/); assert.match(m, /10% off/); assert.match(m, /once/); assert.match(m, /60 days/); assert.match(m, /yallahaul\.com/)
    assert.doesNotMatch(rewardMessage({ storeName: '', name: '', code: 'X', percent: 5, days: 7, delivered: 0, siteUrl: '' }), /0 orders|undefined|Hi /)
  })
  it('tells unused, used, expired and switched-off codes apart', () => {
    const now = new Date('2026-10-22T00:00:00Z')
    assert.equal(codeState({ usedCount: 0, expiresAt: '2026-12-01T00:00:00Z', isActive: true }, now), 'unused')
    assert.equal(codeState({ usedCount: 1, expiresAt: '2026-12-01T00:00:00Z', isActive: true }, now), 'used')
    assert.equal(codeState({ usedCount: 0, expiresAt: '2026-10-01T00:00:00Z', isActive: true }, now), 'expired')
    assert.equal(codeState({ usedCount: 0, expiresAt: null, isActive: false }, now), 'off')
    assert.equal(codeState(null, now), 'off')
  })
})

describe('rewards: the code, the database and the launch clean-up', () => {
  it('makes a one-use percentage discount, and the same reward only once', () => {
    const lib = read('lib/rewards.ts')
    assert.match(lib, /type: 'PERCENTAGE', value: config\.percent, maxUses: 1/)
    assert.match(lib, /phone_milestone/) // the (phone, milestone) pair is unique
    assert.match(lib, /loadRewardCustomers\(config\)\)\.find\(c => c\.phone === phone\)/) // worked out again from the orders, not trusted from the page
    assert.match(lib, /if \(!config\.enabled\) throw/)
  })
  it('is for staff who can manage discounts, and is written to the history', () => {
    const route = read('app/api/admin/rewards/route.ts')
    assert.equal((route.match(/requirePermission\('coupons\.manage'\)/g) || []).length, 2)
    assert.match(route, /audit\(actor\.id, 'rewards\.updated'/); assert.match(route, /audit\(actor\.id, 'rewards\.code_made'/)
  })
  it('adds one table and changes nothing that exists', () => {
    const sql = read('prisma/migrations/20261026000000_phone_rewards/migration.sql')
    const statements = sql.split(';').map(x => x.replace(/--.*$/gm, '').trim()).filter(Boolean)
    assert.match(statements[0], /^CREATE TABLE "PhoneReward"/)
    assert.ok(statements.slice(1).every(x => /^CREATE (UNIQUE )?INDEX "PhoneReward_/.test(x)))
    assert.doesNotMatch(sql, /DROP |TRUNCATE|DELETE FROM|UPDATE "|ALTER TABLE/)
    assert.match(sql, /"PhoneReward_phone_milestone_key" ON "PhoneReward"\("phone", "milestone"\)/)
  })
  it('is in the menu and cleaned at launch (list wiped, codes switched off)', () => {
    assert.match(read('app/admin/layout.tsx'), /href: '\/admin\/marketing\/rewards', label: 'Rewards'/)
    const cleanup = read('scripts/launch-cleanup.mjs')
    assert.match(cleanup, /UPDATE "Coupon" SET "isActive" = false, "updatedAt" = now\(\) WHERE code IN \(SELECT code FROM "PhoneReward"\)/)
    assert.match(cleanup, /'WinbackContact', 'PhoneReward'/)
    assert.ok(cleanup.indexOf('WHERE code IN (SELECT code FROM "PhoneReward")') < cleanup.indexOf("'WinbackContact', 'PhoneReward'"), 'the codes are switched off before their list is cleared')
  })
})

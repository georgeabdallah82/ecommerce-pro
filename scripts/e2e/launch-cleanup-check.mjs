// Rehearsal of the launch clean-up (scripts/launch-cleanup.mjs) on a THROWAWAY database: adds fake
// test orders, customers and the rest, runs preview and clean, and checks exactly what went and
// what stayed. Used by the PostgreSQL staging check on every pull request. Refuses to run unless
// LAUNCH_CLEANUP_REHEARSAL=throwaway, so it can't be pointed at the store by mistake.
import pg from 'pg'
import { main } from '../launch-cleanup.mjs'

const url = process.env.DATABASE_URL
if (process.env.LAUNCH_CLEANUP_REHEARSAL !== 'throwaway') throw new Error('Set LAUNCH_CLEANUP_REHEARSAL=throwaway: this adds and deletes data')
if (!url || /neon\.tech/.test(url)) throw new Error('DATABASE_URL must be a throwaway database (never the store)')

const db = new pg.Client({ connectionString: url })
await db.connect()
let failures = 0
const ok = (cond, msg) => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`) }
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const n = async (sql, params = []) => Number((await one(sql, params)).n)
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn() } finally { console.log = log } }
const expectRefusal = async (argv, pattern, msg) => {
  try { await quiet(() => main(argv, { DATABASE_URL: url })); ok(false, `${msg} (it ran)`) } catch (e) { ok(pattern.test(String(e.message)), `${msg} ("${String(e.message).split('\n').slice(1).join(' ').trim().slice(0, 90)}")`) }
}

// Insert a row, filling ids and updatedAt the way the app would.
const columnsCache = new Map()
async function insert(table, row) {
  if (!columnsCache.has(table)) columnsCache.set(table, (await db.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).rows)
  const data = { ...row }
  for (const c of columnsCache.get(table)) {
    if (c.column_name in data || c.is_nullable === 'YES' || c.column_default !== null) continue
    if (c.column_name === 'id') data.id = `lc_${table}_${Math.random().toString(36).slice(2, 10)}`
    else if (c.column_name === 'updatedAt') data.updatedAt = new Date()
    else throw new Error(`${table}.${c.column_name} needs a value`)
  }
  const keys = Object.keys(data)
  await db.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(data))
  return data
}

// ---- Fake test data on top of whatever the store already has
const product = await one(`SELECT p.id, p.sku FROM "Product" p JOIN "InventoryItem" i ON i."productId" = p.id AND i."variantId" IS NULL ORDER BY p."createdAt" LIMIT 1`)
const inv = await one(`SELECT id FROM "InventoryItem" WHERE "productId" = $1 AND "variantId" IS NULL ORDER BY id LIMIT 1`, [product.id])
await db.query(`UPDATE "InventoryItem" SET quantity = 50, reserved = 0 WHERE id = $1`, [inv.id])
await db.query(`UPDATE "InventoryItem" SET reserved = 0`)
await db.query(`DELETE FROM "InventoryMovement" WHERE type IN ('SALE_RESERVATION', 'SALE_RELEASE', 'SALE_FULFILLMENT', 'RETURN')`)
const staffBefore = await n(`SELECT count(*) AS n FROM "User" WHERE role <> 'CUSTOMER'`)
const productsBefore = await n(`SELECT count(*) AS n FROM "Product"`)

const keepUser = await insert('User', { id: 'lc_keep', name: 'Kept Customer', email: 'lc-keep@example.com', passwordHash: 'x' })
const goneUser = await insert('User', { id: 'lc_gone', name: 'Test Customer', email: 'lc-gone@example.com', passwordHash: 'x' })
await insert('Address', { userId: goneUser.id, firstName: 'T', lastName: 'C', line1: 'x', city: 'Beirut', country: 'Lebanon' })
await insert('WishlistItem', { userId: keepUser.id, productId: product.id })
await insert('WishlistItem', { userId: goneUser.id, productId: product.id })
await insert('Review', { productId: product.id, userId: goneUser.id, rating: 5 })
await insert('Notification', { userId: keepUser.id, title: 't', body: 't', type: 'ORDER_CREATED' })
await insert('Coupon', { code: 'LCTEST', type: 'PERCENTAGE', value: 10, usedCount: 5 })

const order = (id, number, extra) => insert('Order', { id, orderNumber: number, email: 'x@example.com', subtotal: 1000, grandTotal: 1000, shippingAddressJson: '{}', ...extra })
// A kept order with a store number, above any order the browser test placed before this (write-path.mjs).
await order('lc_o_keep_num', '1500', { userId: keepUser.id, status: 'CONFIRMED', couponCode: 'LCTEST' })
await order('lc_o_keep_txt', 'LC-KEEP-1', { userId: keepUser.id })
await order('lc_o_gone_shipped', 'LC-GONE-1', { userId: goneUser.id, status: 'SHIPPED', couponCode: 'LCTEST' })
await order('lc_o_gone_new', 'LC-GONE-2', {})
for (const orderId of ['lc_o_keep_num', 'lc_o_keep_txt', 'lc_o_gone_shipped', 'lc_o_gone_new']) {
  await insert('OrderItem', { orderId, productId: product.id, name: 'Item', sku: product.sku, quantity: 1, unitPrice: 1000, totalPrice: 1000 })
  await insert('OrderEvent', { orderId, status: 'PENDING', message: 'Order placed.' })
}
await insert('PaymentTransaction', { orderId: 'lc_o_gone_shipped', provider: 'manual', status: 'paid', amount: 1000, currency: 'USD' })
await insert('Fulfillment', { orderId: 'lc_o_gone_shipped' })
await insert('DeliveryTracking', { orderId: 'lc_o_gone_shipped', trackingToken: 'lc-track' })
await insert('DraftOrder', { orderNumber: 'D-LC-1', email: 'x@example.com' })
await insert('GiftCard', { code: 'LC-GC-GONE', last4: 'GONE', initialAmount: 500, balance: 500, note: 'Issued from order LC-GONE-1' })
await insert('GiftCard', { code: 'LC-GC-KEEP', last4: 'KEEP', initialAmount: 500, balance: 500, note: 'Made by hand' })
await insert('AbandonedCheckout', { token: 'lc-cart', cartJson: '[]' })
await insert('PhoneSubscriber', { phone: '96170000001' })
await insert('ProductQuestion', { productId: product.id, name: 'Maya', question: 'Is it big?' })
await insert('InviteCode', { code: 'MAYALC1', phone: '96170000002' })
await insert('WinbackContact', { phone: '96170000003' })
await insert('PhoneReward', { phone: '96170000003', milestone: 1, code: 'LOYALLC1' })
await insert('Coupon', { code: 'LOYALLC1', type: 'PERCENTAGE', value: 10, maxUses: 1 })
// An influencer and a payment written down for them: the payment is test data, the influencer (and their code) stays.
await insert('Influencer', { id: 'lc_inf', name: 'Maya', code: 'MAYALC10', customerPercent: 10, commissionPercent: 10 })
await insert('InfluencerPayout', { influencerId: 'lc_inf', amount: 500 })
// Drivers and running costs are the store's own, not test data: they stay.
await insert('Driver', { id: 'lc_driver', name: 'Ali', token: 'lc-driver-token-0123456789abcdef' })
await insert('Expense', { name: 'Rent', amount: 30000, startsOn: new Date('2026-10-01') })
await db.query(`UPDATE "Order" SET "driverId" = 'lc_driver', "cashCollected" = 1000 WHERE id = 'lc_o_gone_shipped'`)
// A friend's test order made a thank-you code: the code is switched off (discounts are never deleted).
await insert('InviteReward', { orderId: 'lc_o_gone_new', inviteCode: 'MAYALC1', rewardCode: 'THANKSLC1' })
await insert('Coupon', { code: 'THANKSLC1', type: 'FIXED', value: 500, maxUses: 1 })
await insert('EmailLog', { to: 'x@example.com', subject: 's', status: 'sent' })
await insert('VisitorSession', { sid: 'lc-visitor', path: '/', landingPath: '/' })
await insert('VisitorPageView', { sid: 'lc-visitor', path: '/' })
await insert('AuditLog', { action: 'order.created', entity: 'Order' })
await insert('Setting', { key: 'newsletter.subscriber.x@example.com', value: '{}' })
await insert('Setting', { key: 'push.subscription.lc-staff-phone', value: '{}' })
await db.query(`INSERT INTO "Setting" (id, key, value, "updatedAt") VALUES ('lc_maint', 'maintenance.enabled', 'false', now()) ON CONFLICT (key) DO UPDATE SET value = 'false'`)
// Stock: LC-GONE-2 holds 3; LC-GONE-1 reserved 2 and delivered them; kept #1500 holds 4.
const move = (type, quantity, referenceId) => insert('InventoryMovement', { inventoryId: inv.id, type, quantity, referenceId })
await move('SALE_RESERVATION', 3, 'LC-GONE-2')
await move('SALE_RESERVATION', 2, 'LC-GONE-1'); await move('SALE_FULFILLMENT', 2, 'LC-GONE-1')
await move('SALE_RESERVATION', 4, '1500')
await db.query(`UPDATE "InventoryItem" SET quantity = 48, reserved = 7 WHERE id = $1`, [inv.id])

const ordersBefore = await n(`SELECT count(*) AS n FROM "Order"`)
const settingsBefore = await n(`SELECT count(*) AS n FROM "Setting" WHERE key NOT LIKE 'newsletter.subscriber.%'`)
const keep = ['--keep-orders', '#1500, lc-keep-1']

// ---- Preview changes nothing
const preview = await quiet(() => main(['preview', ...keep], { DATABASE_URL: url }))
ok(preview.before.ordersGone === ordersBefore - 2, `preview: ${preview.before.ordersGone} of ${ordersBefore} orders would go, 2 kept`)
ok(await n(`SELECT count(*) AS n FROM "Order"`) === ordersBefore, 'preview: nothing deleted')

// ---- Refusals change nothing
await expectRefusal(['clean', '--confirm', 'DELETE TEST DATA', ...keep], /maintenance mode/, 'clean refuses while the store is open')
await db.query(`UPDATE "Setting" SET value = 'true' WHERE key = 'maintenance.enabled'`)
await expectRefusal(['clean', '--confirm', 'delete', ...keep], /confirmation exactly/, 'clean refuses a wrong confirmation phrase')
await expectRefusal(['clean', '--confirm', 'DELETE TEST DATA', '--keep-orders', '1500 9999'], /do not exist: 9999/, 'clean refuses an order number to keep that does not exist')
ok(await n(`SELECT count(*) AS n FROM "Order"`) === ordersBefore, 'refusals: nothing deleted')

// ---- Clean, keeping two orders and putting delivered stock back
const result = await quiet(() => main(['clean', '--confirm', 'DELETE TEST DATA', ...keep, '--restore-stock'], { DATABASE_URL: url }))
const left = (await db.query(`SELECT "orderNumber" FROM "Order" ORDER BY "orderNumber"`)).rows.map(r => r.orderNumber)
ok(JSON.stringify(left) === JSON.stringify(['1500', 'LC-KEEP-1']), `clean: only the kept orders are left (${left.join(', ')})`)
ok(result.after.ordersAll === 2, 'clean: the result reports 2 orders left')
ok(await n(`SELECT count(*) AS n FROM "OrderItem"`) === 2 && await n(`SELECT count(*) AS n FROM "PaymentTransaction"`) === 0, 'clean: items and payments of removed orders are gone')
ok(await n(`SELECT count(*) AS n FROM "User" WHERE id = 'lc_keep'`) === 1 && await n(`SELECT count(*) AS n FROM "User" WHERE id = 'lc_gone'`) === 0, 'clean: the customer of a kept order stays, the test customer goes')
ok(await n(`SELECT count(*) AS n FROM "User" WHERE role <> 'CUSTOMER'`) === staffBefore, 'clean: staff accounts all stay')
ok(await n(`SELECT count(*) AS n FROM "Product"`) === productsBefore, 'clean: products all stay')
const stock = await one(`SELECT quantity, reserved FROM "InventoryItem" WHERE id = $1`, [inv.id])
ok(stock.reserved === 4 && stock.quantity === 50, `clean: stock held by test orders released, delivered units put back (quantity ${stock.quantity}, reserved ${stock.reserved}; expected 50 and 4)`)
ok(await n(`SELECT count(*) AS n FROM "InventoryMovement" WHERE "referenceId" IN ('LC-GONE-1', 'LC-GONE-2')`) === 0 && await n(`SELECT count(*) AS n FROM "InventoryMovement" WHERE "referenceId" = '1500'`) === 1, 'clean: stock history of removed orders gone, kept order\'s stays')
ok(await n(`SELECT count(*) AS n FROM "Fulfillment"`) === 0 && await n(`SELECT count(*) AS n FROM "DeliveryTracking"`) === 0 && await n(`SELECT count(*) AS n FROM "DraftOrder"`) === 0, 'clean: parcels, delivery tracking and draft orders gone')
ok(await n(`SELECT count(*) AS n FROM "GiftCard" WHERE code = 'LC-GC-GONE'`) === 0 && await n(`SELECT count(*) AS n FROM "GiftCard" WHERE code = 'LC-GC-KEEP'`) === 1, 'clean: gift card from a test order gone, hand-made one stays')
ok(await n(`SELECT count(*) AS n FROM "Review"`) === 0 && await n(`SELECT count(*) AS n FROM "WishlistItem" WHERE "userId" = 'lc_keep'`) === 1, 'clean: reviews gone, kept customer\'s wishlist stays')
ok(await n(`SELECT count(*) AS n FROM "Driver"`) === 1 && await n(`SELECT count(*) AS n FROM "Expense"`) === 1, 'clean: drivers and running costs stay')
ok((await one(`SELECT "isActive" FROM "Coupon" WHERE code = 'THANKSLC1'`)).isActive === false && (await one(`SELECT "isActive" FROM "Coupon" WHERE code = 'LCTEST'`)).isActive === true, 'clean: test thank-you code switched off, other discounts untouched')
for (const table of ['AbandonedCheckout', 'PhoneSubscriber', 'ProductQuestion', 'InviteCode', 'InviteReward', 'WinbackContact', 'EmailLog', 'VisitorSession', 'VisitorPageView', 'Notification']) ok(await n(`SELECT count(*) AS n FROM "${table}"`) === 0, `clean: ${table} emptied`)
ok(await n(`SELECT count(*) AS n FROM "PhoneReward"`) === 0 && await n(`SELECT count(*) AS n FROM "Coupon" WHERE code = 'LOYALLC1' AND NOT "isActive"`) === 1, 'clean: reward code list gone, its code switched off')
ok(await n(`SELECT count(*) AS n FROM "InfluencerPayout"`) === 0 && await n(`SELECT count(*) AS n FROM "Influencer" WHERE code = 'MAYALC10'`) === 1, 'clean: influencer payments gone, the influencer and their code stay')
ok(await n(`SELECT count(*) AS n FROM "Setting" WHERE key LIKE 'newsletter.subscriber.%'`) === 0, 'clean: newsletter signups gone')
ok(await n(`SELECT count(*) AS n FROM "Setting" WHERE key NOT LIKE 'newsletter.subscriber.%'`) === settingsBefore, 'clean: all other settings stay (staff phone alerts, maintenance)')
ok((await one(`SELECT "usedCount" FROM "Coupon" WHERE code = 'LCTEST'`)).usedCount === 1, 'clean: coupon use count = kept orders using it')
ok((await one(`SELECT value FROM "Counter" WHERE name = 'order'`)).value === 1500, 'clean: next order number follows the highest kept number (#1501)')
ok(await n(`SELECT count(*) AS n FROM "AuditLog"`) === 1 && await n(`SELECT count(*) AS n FROM "AuditLog" WHERE action = 'launch.cleanup'`) === 1, 'clean: audit log holds only the clean-up record')

// ---- Clean everything: next order is #1001
await quiet(() => main(['clean', '--confirm', 'DELETE TEST DATA'], { DATABASE_URL: url }))
ok(await n(`SELECT count(*) AS n FROM "Order"`) === 0 && await n(`SELECT count(*) AS n FROM "User" WHERE role = 'CUSTOMER'`) === 0, 'clean all: no orders, no customer accounts')
ok((await one(`SELECT value FROM "Counter" WHERE name = 'order'`)).value === 1000, 'clean all: the next order is #1001')
ok((await one(`SELECT reserved FROM "InventoryItem" WHERE id = $1`, [inv.id])).reserved === 0, 'clean all: no stock reserved')
ok(await n(`SELECT count(*) AS n FROM "User" WHERE role <> 'CUSTOMER'`) === staffBefore && await n(`SELECT count(*) AS n FROM "Product"`) === productsBefore, 'clean all: staff and products still all there')

await db.end()
console.log(failures ? `\n${failures} failure(s)` : '\nlaunch clean-up rehearsal: all passed')
process.exit(failures ? 1 : 0)

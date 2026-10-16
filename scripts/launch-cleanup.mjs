// Launch clean-up: before the store opens to customers, remove everything left from building and
// testing it. Run from GitHub (Actions > "Launch clean-up"), never from the website or the admin.
//
//   node scripts/launch-cleanup.mjs preview              read only: what would go, what stays
//   node scripts/launch-cleanup.mjs clean --confirm "DELETE TEST DATA"
//   node scripts/launch-cleanup.mjs preview --strict --confirm "..."   preview that fails if a clean
//                                                                     with these options would refuse
//
// Options (both modes): --keep-orders "1004, 1007"  --keep-customers "a@b.com"  --restore-stock
// The database is DATABASE_URL (the workflow passes Neon's direct address).
//
// Removed: test orders (items, history, notes, payments, parcels, returns, edits, delivery
// tracking, draft orders, gift cards they issued) and the stock they held, customer accounts
// (addresses, wishlists, reviews, coins, wallet), all reviews, abandoned checkouts, newsletter and WhatsApp
// signups, email opt-outs, the email log, visitor stats, customer push devices, back-in-stock
// requests, notifications, sign-in limits and the audit log. Coupon use counts restart and the next
// order is #1001.
// Kept: products, photos, stock counts, collections, pages, blog, theme, settings, shipping and
// tax, coupons, staff accounts and their phones' order alerts, ad spend, purchase orders.
//
// Safety: "clean" only runs while the store is in maintenance mode (not open to customers), with
// the exact confirmation phrase, when every order/customer to keep exists, and in one transaction
// that is rolled back if any check afterwards fails. The workflow takes a backup first.
import pg from 'pg'

export const CONFIRM_PHRASE = 'DELETE TEST DATA'
export const FIRST_ORDER_NUMBER = 1001

// "1004, #1007 1010" -> ['1004', '1007', '1010']. Order numbers are stored upper case (ORD-...).
export function parseOrderNumbers(raw) {
  return [...new Set(String(raw || '').split(/[\s,;]+/).map(x => x.trim().replace(/^#/, '').toUpperCase()).filter(Boolean))]
}

export function parseEmails(raw) {
  return [...new Set(String(raw || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))]
}

export function parseArgs(argv) {
  const args = { mode: argv[0] || 'preview', confirm: '', keepOrders: [], keepCustomers: [], restoreStock: false, strict: false }
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--confirm') args.confirm = String(argv[++i] || '')
    else if (flag === '--keep-orders') args.keepOrders = parseOrderNumbers(argv[++i])
    else if (flag === '--keep-customers') args.keepCustomers = parseEmails(argv[++i])
    else if (flag === '--restore-stock') args.restoreStock = true
    else if (flag === '--strict') args.strict = true
    else throw new Error(`Unknown option: ${flag}`)
  }
  if (!['preview', 'clean'].includes(args.mode)) throw new Error('Mode must be "preview" or "clean"')
  return args
}

// Why "clean" may not run (empty = it may). Pure, so the rules are tested on their own.
export function cleanBlockers({ mode, confirm, maintenanceOn, missingOrders, missingCustomers }) {
  const problems = []
  if (mode !== 'clean') return problems
  if (confirm !== CONFIRM_PHRASE) problems.push(`Type the confirmation exactly: ${CONFIRM_PHRASE}`)
  if (!maintenanceOn) problems.push('The store is open to customers. Turn on maintenance mode (Settings > Maintenance) first: this clean-up is only for before the launch.')
  if (missingOrders.length) problems.push(`Orders to keep that do not exist: ${missingOrders.join(', ')} (check the numbers)`)
  if (missingCustomers.length) problems.push(`Customers to keep that do not exist: ${missingCustomers.length} email address(es) (check the spelling)`)
  return problems
}

// The rows that go, as SQL. $1 = order numbers to keep, $2 = customer emails to keep.
const GONE_ORDERS = `SELECT o.id, o."orderNumber" FROM "Order" o WHERE NOT (o."orderNumber" = ANY($1::text[]))`
const GONE_USERS = `SELECT u.id FROM "User" u WHERE u.role = 'CUSTOMER' AND NOT (lower(u.email) = ANY($2::text[]))
  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."userId" = u.id AND o."orderNumber" = ANY($1::text[]))`
// Per stock row, from the stock movements of the orders that go: units they still hold (reserved)
// and units their deliveries took out of stock (fulfilled minus returned).
const STOCK_EFFECT = `SELECT m."inventoryId" AS id,
    SUM(CASE m.type WHEN 'SALE_RESERVATION' THEN m.quantity WHEN 'SALE_RELEASE' THEN -m.quantity WHEN 'SALE_FULFILLMENT' THEN -m.quantity ELSE 0 END)::int AS held,
    SUM(CASE m.type WHEN 'SALE_FULFILLMENT' THEN m.quantity WHEN 'RETURN' THEN -m.quantity ELSE 0 END)::int AS shipped
  FROM "InventoryMovement" m JOIN (${GONE_ORDERS}) g ON g."orderNumber" = m."referenceId"
  GROUP BY m."inventoryId"`

// What is counted, removed and kept. Each count is one query against the live tables.
const COUNTS = {
  ordersAll: `SELECT count(*)::int AS n FROM "Order"`,
  ordersGone: `SELECT count(*)::int AS n FROM (${GONE_ORDERS}) g`,
  customersAll: `SELECT count(*)::int AS n FROM "User" WHERE role = 'CUSTOMER'`,
  customersGone: `SELECT count(*)::int AS n FROM (${GONE_USERS}) g`,
  staff: `SELECT count(*)::int AS n FROM "User" WHERE role <> 'CUSTOMER'`,
  draftOrders: `SELECT count(*)::int AS n FROM "DraftOrder" d WHERE NOT EXISTS (SELECT 1 FROM "Order" o WHERE o.id = d."completedOrderId" AND o."orderNumber" = ANY($1::text[]))`,
  parcels: `SELECT count(*)::int AS n FROM "Fulfillment" WHERE "orderId" IN (SELECT id FROM (${GONE_ORDERS}) g)`,
  returns: `SELECT count(*)::int AS n FROM "ReturnRequest" WHERE "orderId" IN (SELECT id FROM (${GONE_ORDERS}) g)`,
  orderEdits: `SELECT count(*)::int AS n FROM "OrderEdit" WHERE "orderId" IN (SELECT id FROM (${GONE_ORDERS}) g)`,
  giftCardsGone: `SELECT count(*)::int AS n FROM "GiftCard" WHERE note IN (SELECT 'Issued from order ' || "orderNumber" FROM (${GONE_ORDERS}) g) OR "customerId" IN (SELECT id FROM (${GONE_USERS}) u)`,
  giftCardsKept: `SELECT count(*)::int AS n FROM "GiftCard" WHERE NOT (note IS NOT NULL AND note IN (SELECT 'Issued from order ' || "orderNumber" FROM (${GONE_ORDERS}) g)) AND ("customerId" IS NULL OR "customerId" NOT IN (SELECT id FROM (${GONE_USERS}) u))`,
  reviews: `SELECT count(*)::int AS n FROM "Review"`,
  wishlist: `SELECT count(*)::int AS n FROM "WishlistItem" WHERE "userId" IN (SELECT id FROM (${GONE_USERS}) u)`,
  abandonedCheckouts: `SELECT count(*)::int AS n FROM "AbandonedCheckout"`,
  newsletter: `SELECT count(*)::int AS n FROM "Setting" WHERE key LIKE 'newsletter.subscriber.%'`,
  whatsappSignups: `SELECT count(*)::int AS n FROM "PhoneSubscriber"`,
  questions: `SELECT count(*)::int AS n FROM "ProductQuestion"`,
  inviteCodes: `SELECT count(*)::int AS n FROM "InviteCode"`,
  winbackContacts: `SELECT count(*)::int AS n FROM "WinbackContact"`,
  // Thank-you codes made for test orders' inviters: one-use discounts, switched off (kept, like all discounts).
  inviteRewardCoupons: `SELECT count(*)::int AS n FROM "Coupon" WHERE "isActive" AND code IN (SELECT r."rewardCode" FROM "InviteReward" r WHERE r."orderId" IN (SELECT id FROM (${GONE_ORDERS}) g))`,
  emailOptOuts: `SELECT count(*)::int AS n FROM "EmailOptOut"`,
  emailLog: `SELECT count(*)::int AS n FROM "EmailLog"`,
  visitorSessions: `SELECT count(*)::int AS n FROM "LiveVisitorSession"`,
  customerPushDevices: `SELECT count(*)::int AS n FROM "PushSubscription"`,
  backInStock: `SELECT count(*)::int AS n FROM "BackInStockRequest"`,
  notifications: `SELECT count(*)::int AS n FROM "Notification"`,
  auditLog: `SELECT count(*)::int AS n FROM "AuditLog"`,
  products: `SELECT count(*)::int AS n FROM "Product"`,
  collections: `SELECT count(*)::int AS n FROM "Collection"`,
  coupons: `SELECT count(*)::int AS n FROM "Coupon"`,
  pages: `SELECT count(*)::int AS n FROM "Page"`,
  adSpend: `SELECT count(*)::int AS n FROM "AdSpend"`,
  purchaseOrders: `SELECT count(*)::int AS n FROM "PurchaseOrder"`,
  staffPushDevices: `SELECT count(*)::int AS n FROM "Setting" WHERE key LIKE 'push.subscription.%'`,
}

async function counts(client, params) {
  const out = {}
  for (const [name, sql] of Object.entries(COUNTS)) out[name] = (await client.query(sql, sqlParams(sql, params))).rows[0].n
  return out
}

// Only pass the parameters a query uses ($1, $2), as PostgreSQL requires.
function sqlParams(sql, [orders, emails]) {
  if (sql.includes('$2')) return [orders, emails]
  if (sql.includes('$1')) return [orders]
  return []
}

async function storeState(client, keepOrders, keepCustomers) {
  const maintenance = await client.query(`SELECT value FROM "Setting" WHERE key = 'maintenance.enabled'`)
  const foundOrders = (await client.query(`SELECT "orderNumber" FROM "Order" WHERE "orderNumber" = ANY($1::text[])`, [keepOrders])).rows.map(r => r.orderNumber)
  const foundCustomers = (await client.query(`SELECT lower(email) AS email FROM "User" WHERE role = 'CUSTOMER' AND lower(email) = ANY($1::text[])`, [keepCustomers])).rows.map(r => r.email)
  const counter = (await client.query(`SELECT value FROM "Counter" WHERE name = 'order'`)).rows[0]?.value ?? null
  return {
    maintenanceOn: maintenance.rows[0]?.value === 'true',
    missingOrders: keepOrders.filter(n => !foundOrders.includes(n)),
    missingCustomers: keepCustomers.filter(e => !foundCustomers.includes(e)),
    counter,
  }
}

// The orders that go, without any personal details: number, date, status, total, items.
async function orderList(client, params) {
  const { rows } = await client.query(`SELECT o."orderNumber" AS number, to_char(o."createdAt", 'YYYY-MM-DD') AS day, o.status, o."paymentMethod" AS method, o."grandTotal" AS total, o.currency,
      (SELECT COALESCE(SUM(i.quantity), 0)::int FROM "OrderItem" i WHERE i."orderId" = o.id) AS items
    FROM "Order" o WHERE NOT (o."orderNumber" = ANY($1::text[])) ORDER BY o."createdAt"`, [params[0]])
  return rows
}

async function stockList(client, params) {
  const { rows } = await client.query(`SELECT p.name AS product, v.name AS variant, i.quantity, i.reserved, e.held, e.shipped
    FROM (${STOCK_EFFECT}) e JOIN "InventoryItem" i ON i.id = e.id JOIN "Product" p ON p.id = i."productId" LEFT JOIN "ProductVariant" v ON v.id = i."variantId"
    WHERE e.held <> 0 OR e.shipped <> 0 ORDER BY p.name, v.name NULLS FIRST`, [params[0]])
  return rows
}

const money = (cents, currency) => `${(cents / 100).toFixed(2)} ${currency || ''}`.trim()

function printPreview({ c, orders, stock, state, args }) {
  const keepOrders = c.ordersAll - c.ordersGone
  const keepCustomers = c.customersAll - c.customersGone
  console.log('==== LAUNCH CLEAN-UP: what would happen ====')
  console.log(`Store open to customers: ${state.maintenanceOn ? 'no (maintenance mode is on)' : 'YES - turn on maintenance mode before cleaning'}`)
  console.log('')
  console.log('REMOVED')
  console.log(`  Orders: ${c.ordersGone} of ${c.ordersAll}${keepOrders ? ` (keeping ${keepOrders}: ${args.keepOrders.join(', ')})` : ''}`)
  console.log(`  Customer accounts: ${c.customersGone} of ${c.customersAll}${keepCustomers ? ` (keeping ${keepCustomers})` : ''}`)
  console.log(`  Draft orders: ${c.draftOrders} | Parcels: ${c.parcels} | Returns: ${c.returns} | Order edits: ${c.orderEdits}`)
  console.log(`  Gift cards from these orders/customers: ${c.giftCardsGone}`)
  console.log(`  Reviews: ${c.reviews} | Wishlist items: ${c.wishlist}`)
  console.log(`  Abandoned checkouts: ${c.abandonedCheckouts} | Newsletter signups: ${c.newsletter} | WhatsApp signups: ${c.whatsappSignups} | Email opt-outs: ${c.emailOptOuts}`)
  console.log(`  Email log: ${c.emailLog} | Visitor stats: ${c.visitorSessions} | Customer push devices: ${c.customerPushDevices}`)
  console.log(`  Back-in-stock requests: ${c.backInStock} | Notifications: ${c.notifications} | Audit log: ${c.auditLog}`)
  console.log(`  Product questions: ${c.questions} | Invite codes: ${c.inviteCodes} | Win-back messages: ${c.winbackContacts}`)
  console.log(`  Order numbers restart: the next order is #${state.counter === null ? FIRST_ORDER_NUMBER : state.counter + 1} now, #${FIRST_ORDER_NUMBER} after the clean-up${keepOrders ? ' (or the one after the highest kept number)' : ''}`)
  console.log('')
  console.log('KEPT')
  console.log(`  Products: ${c.products} | Collections: ${c.collections} | Pages: ${c.pages} | Coupons: ${c.coupons} (use counts restart; ${c.inviteRewardCoupons} invite thank-you code(s) from test orders switched off)`)
  console.log(`  Staff accounts: ${c.staff} | Staff phones with order alerts: ${c.staffPushDevices} | Gift cards not from tests: ${c.giftCardsKept}`)
  console.log(`  Ad spend entries: ${c.adSpend} | Purchase orders: ${c.purchaseOrders} | Theme, settings, shipping, photos: all`)
  if (state.missingOrders.length || state.missingCustomers.length) {
    console.log('')
    if (state.missingOrders.length) console.log(`WARNING: orders to keep not found: ${state.missingOrders.join(', ')}`)
    if (state.missingCustomers.length) console.log(`WARNING: ${state.missingCustomers.length} customer email(s) to keep not found`)
  }
  console.log('')
  console.log(`STOCK held or sent out by the orders that go (${args.restoreStock ? 'delivered units WILL be put back' : 'delivered units stay out unless "restore stock" is chosen'})`)
  if (!stock.length) console.log('  (none)')
  for (const s of stock) console.log(`  ${s.product}${s.variant ? ` - ${s.variant}` : ''}: in stock ${s.quantity}, reserved ${s.reserved}; these orders hold ${Math.max(0, s.held)}, their deliveries took ${Math.max(0, s.shipped)}`)
  console.log('')
  console.log(`ORDERS THAT GO (${orders.length}; number, date, status, payment, total, items)`)
  for (const o of orders) console.log(`  #${o.number}  ${o.day}  ${o.status}  ${o.method}  ${money(o.total, o.currency)}  ${o.items} item(s)`)
}

async function clean(client, args, before) {
  const params = [args.keepOrders, args.keepCustomers]
  const run = (sql, p = []) => client.query(sql, p)
  await run(`SET LOCAL lock_timeout = '15s'`)
  await run(`SET LOCAL statement_timeout = '120s'`)
  // Fix the sets first: the deletes below change the tables they are read from.
  await run(`CREATE TEMP TABLE gone_orders (id text PRIMARY KEY, "orderNumber" text NOT NULL) ON COMMIT DROP`)
  await run(`INSERT INTO gone_orders ${GONE_ORDERS}`, [params[0]])
  await run(`CREATE TEMP TABLE gone_users (id text PRIMARY KEY) ON COMMIT DROP`)
  await run(`INSERT INTO gone_users ${GONE_USERS}`, params)
  await run(`CREATE TEMP TABLE stock_effect (id text PRIMARY KEY, held int NOT NULL, shipped int NOT NULL) ON COMMIT DROP`)
  await run(`INSERT INTO stock_effect ${STOCK_EFFECT}`, [params[0]])

  // Stock: release what the orders that go still hold; optionally put back what they delivered.
  await run(`UPDATE "InventoryItem" i SET reserved = GREATEST(0, i.reserved - GREATEST(0, e.held))${args.restoreStock ? ', quantity = i.quantity + GREATEST(0, e.shipped)' : ''}
    FROM stock_effect e WHERE e.id = i.id`)
  await run(`DELETE FROM "InventoryMovement" m USING gone_orders g WHERE m."referenceId" = g."orderNumber"`)
  if (args.restoreStock) {
    await run(`INSERT INTO "InventoryMovement" (id, "inventoryId", type, quantity, reason, "referenceId", "createdAt")
      SELECT 'launch_' || md5(e.id || clock_timestamp()::text), e.id, 'ADJUSTMENT'::"InventoryMovementType", e.shipped, 'Launch clean-up: stock sent out by test orders put back', 'launch-cleanup', now()
      FROM stock_effect e WHERE e.shipped > 0`)
  }

  // Orders and everything hanging off them (items, history, notes and payments go with the order).
  await run(`DELETE FROM "DeliveryTracking" WHERE "orderId" IN (SELECT id FROM gone_orders)`)
  await run(`DELETE FROM "Fulfillment" WHERE "orderId" IN (SELECT id FROM gone_orders)`)
  await run(`DELETE FROM "ReturnRequest" WHERE "orderId" IN (SELECT id FROM gone_orders)`)
  await run(`DELETE FROM "OrderEdit" WHERE "orderId" IN (SELECT id FROM gone_orders)`)
  await run(`DELETE FROM "DraftOrder" d WHERE NOT EXISTS (SELECT 1 FROM "Order" o WHERE o.id = d."completedOrderId" AND o."orderNumber" = ANY($1::text[]))`, [params[0]])
  await run(`DELETE FROM "GiftCard" WHERE note IN (SELECT 'Issued from order ' || "orderNumber" FROM gone_orders) OR "customerId" IN (SELECT id FROM gone_users)`)
  await run(`UPDATE "Coupon" SET "isActive" = false, "updatedAt" = now() WHERE code IN (SELECT r."rewardCode" FROM "InviteReward" r WHERE r."orderId" IN (SELECT id FROM gone_orders))`)
  await run(`DELETE FROM "Order" WHERE id IN (SELECT id FROM gone_orders)`)

  // Customer accounts (addresses, wishlists, coins, wallet, reset links go with the account).
  await run(`DELETE FROM "CustomerTagMember" WHERE "customerId" IN (SELECT id FROM gone_users)`)
  await run(`DELETE FROM "CustomerSegmentMember" WHERE "customerId" IN (SELECT id FROM gone_users)`)
  await run(`DELETE FROM "User" WHERE id IN (SELECT id FROM gone_users)`)

  // Everything else that only exists because of testing.
  for (const table of ['Review', 'ProductQuestion', 'InviteCode', 'WinbackContact', 'AbandonedCheckout', 'PhoneSubscriber', 'EmailOptOut', 'EmailLog', 'LiveVisitorSession', 'PushSubscription', 'BackInStockRequest', 'Notification', 'PasswordResetToken', 'RateLimitBucket', 'AdminLoginLockout', 'AuditLog']) {
    await run(`DELETE FROM "${table}"`)
  }
  await run(`DELETE FROM "Setting" WHERE key LIKE 'newsletter.subscriber.%'`)

  // Coupons count only the orders that stay; the next order number follows the kept ones.
  await run(`UPDATE "Coupon" c SET "usedCount" = (SELECT count(*)::int FROM "Order" o WHERE upper(o."couponCode") = upper(c.code) AND o.status <> 'CANCELLED')`)
  await run(`INSERT INTO "Counter" (name, value, "updatedAt") VALUES ('order', (SELECT GREATEST(${FIRST_ORDER_NUMBER - 1}, COALESCE(MAX("orderNumber"::bigint), 0))::int FROM "Order" WHERE "orderNumber" ~ '^[0-9]{1,9}$'), now())
    ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`)

  // Checks before anything is saved; any failure undoes the whole clean-up.
  const after = await counts(client, params)
  const problems = []
  if (after.ordersAll !== before.ordersAll - before.ordersGone) problems.push(`orders left ${after.ordersAll}, expected ${before.ordersAll - before.ordersGone}`)
  if (after.ordersGone !== 0) problems.push('some test orders are still there')
  if (after.customersAll !== before.customersAll - before.customersGone) problems.push(`customers left ${after.customersAll}, expected ${before.customersAll - before.customersGone}`)
  for (const kept of ['staff', 'products', 'collections', 'pages', 'coupons', 'adSpend', 'purchaseOrders', 'staffPushDevices']) {
    if (after[kept] !== before[kept]) problems.push(`${kept} changed from ${before[kept]} to ${after[kept]}`)
  }
  const badStock = (await run(`SELECT count(*)::int AS n FROM "InventoryItem" WHERE reserved < 0 OR quantity < 0`)).rows[0].n
  if (badStock) problems.push(`${badStock} stock row(s) went below zero`)
  if (problems.length) throw new Error(`Clean-up checks failed, nothing was changed:\n  - ${problems.join('\n  - ')}`)

  await run(`INSERT INTO "AuditLog" (id, "actorId", action, entity, "entityId", "metadataJson", "createdAt") VALUES ('launch_' || md5(clock_timestamp()::text), NULL, 'launch.cleanup', 'Store', NULL, $1, now())`,
    [JSON.stringify({ ordersRemoved: before.ordersGone, customersRemoved: before.customersGone, ordersKept: args.keepOrders, restoreStock: args.restoreStock })])
  return after
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv)
  const url = env.DATABASE_URL
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL must be a PostgreSQL connection string')
  const client = new pg.Client({ connectionString: url, application_name: 'launch-cleanup' })
  await client.connect()
  try {
    const params = [args.keepOrders, args.keepCustomers]
    // One consistent snapshot: the preview and the clean-up see exactly the same rows.
    await client.query(args.mode === 'clean' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ')
    const state = await storeState(client, args.keepOrders, args.keepCustomers)
    const before = await counts(client, params)
    printPreview({ c: before, orders: await orderList(client, params), stock: await stockList(client, params), state, args })
    const blockers = cleanBlockers({ mode: 'clean', confirm: args.confirm, maintenanceOn: state.maintenanceOn, missingOrders: state.missingOrders, missingCustomers: state.missingCustomers })
    if (args.mode === 'preview') {
      await client.query('ROLLBACK')
      console.log('\nPreview only: nothing was changed.')
      if (args.strict && blockers.length) throw new Error(`A clean-up with these options would not start:\n  - ${blockers.join('\n  - ')}`)
      return { mode: 'preview', before }
    }
    if (blockers.length) {
      await client.query('ROLLBACK')
      throw new Error(`Clean-up not started, nothing was changed:\n  - ${blockers.join('\n  - ')}`)
    }
    let after
    try {
      after = await clean(client, args, before)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
    console.log(`\nDONE. Removed ${before.ordersGone} order(s) and ${before.customersGone} customer account(s). Orders left: ${after.ordersAll}. The next order will be #${(await client.query(`SELECT value FROM "Counter" WHERE name = 'order'`)).rows[0].value + 1}.`)
    return { mode: 'clean', before, after }
  } finally {
    await client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(`\n${error instanceof Error ? error.message : error}`); process.exit(1) })
}

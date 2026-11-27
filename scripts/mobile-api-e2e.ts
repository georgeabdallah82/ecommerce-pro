// End-to-end check of the Android admin app's API against a running store (local dev only).
// Usage: E2E_BASE=http://127.0.0.1:3000 E2E_EMAIL=... E2E_PASSWORD=... E2E_TOTP=<base32> npx tsx scripts/mobile-api-e2e.ts
// It creates test orders and changes stock, so never point it at the live store.
import { totpAt, timeStep } from '../lib/two-step'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000'
if (/yallahaul\.com/.test(BASE)) throw new Error('Refusing to run against the live store')
const EMAIL = process.env.E2E_EMAIL!, PASSWORD = process.env.E2E_PASSWORD!, TOTP = process.env.E2E_TOTP!
const FIXTURES = process.env.E2E_FIXTURES
const INSTALL = 'e2eInstallId_abcdefghijklmnopqrs'.slice(0, 32)
let passed = 0, failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}`, detail ?? '') }
}
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any = null; try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, headers: res.headers }
}
function fixture(name: string, data: unknown) { if (FIXTURES) { mkdirSync(FIXTURES, { recursive: true }); writeFileSync(`${FIXTURES}/${name}.json`, JSON.stringify(data, null, 2)) } }
async function deviceState(token: string) {
  const res = await fetch(BASE + '/api/mobile/v1/devices', { headers: { authorization: `Bearer ${token}`, 'x-install-id': INSTALL } })
  return res.json() as Promise<any>
}
const code = async (offset = 0) => totpAt(TOTP, timeStep(Date.now()) + offset)

async function signIn(email = EMAIL) {
  const login = await call('POST', '/api/mobile/v1/auth/login', { email, password: PASSWORD })
  if (!login.json?.ticket) return { login }
  // A fresh 30-second step each time, since a used code is refused.
  let r = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: await code(), installId: INSTALL })
  if (r.status === 401) r = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: await code(1), installId: INSTALL })
  return { login, codeRes: r, token: r.json?.token as string | undefined }
}

async function main() {
  console.log('Sign-in')
  const bad = await call('POST', '/api/mobile/v1/auth/login', { email: EMAIL, password: 'wrong-password' })
  check('wrong password is refused with 401', bad.status === 401, bad)
  const noTotp = await call('POST', '/api/mobile/v1/auth/login', { email: 'notp@example.com', password: PASSWORD })
  check('staff without 2-step login are sent to set it up', noTotp.status === 403 && noTotp.json?.code === 'ENROLL_REQUIRED', noTotp)
  const login = await call('POST', '/api/mobile/v1/auth/login', { email: EMAIL, password: PASSWORD })
  check('right password returns a ticket, not a session', !!login.json?.ticket && !login.json?.token, login.json)
  const wrongCode = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: '000000', installId: INSTALL })
  check('wrong code is refused', wrongCode.status === 401, wrongCode.json)
  const forgedTicket = await call('POST', '/api/mobile/v1/auth/code', { ticket: 'not-a-ticket', code: await code() })
  check('a forged ticket restarts sign-in', forgedTicket.status === 401 && forgedTicket.json?.code === 'RESTART', forgedTicket.json)
  let usedCode = await code()
  let r = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: usedCode, installId: INSTALL })
  // Run again within the same 30 seconds: that code was used, which the server rightly refuses. Use the next one.
  if (r.status === 401 && /already used/.test(r.json?.error || '')) { usedCode = await code(1); r = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: usedCode, installId: INSTALL }) }
  check('right code returns a token and the permissions', r.status === 200 && !!r.json?.token && r.json.user.permissions.includes('orders.manage'), r.json)
  fixture('code', r.json)
  const token = r.json.token as string
  const reuse = await call('POST', '/api/mobile/v1/auth/code', { ticket: login.json.ticket, code: await code(1), installId: INSTALL })
  check('a ticket starts one session only', reuse.status === 401 && reuse.json?.code === 'RESTART', reuse.json)
  const again = await call('POST', '/api/mobile/v1/auth/login', { email: EMAIL, password: PASSWORD })
  const replay = await call('POST', '/api/mobile/v1/auth/code', { ticket: again.json.ticket, code: usedCode, installId: INSTALL })
  check('the same code cannot be used twice', replay.status === 401 && /already used/.test(replay.json?.error || ''), replay.json)

  console.log('Token rules')
  check('no token: 401 on an admin endpoint', (await call('GET', '/api/admin/orders')).status === 401)
  check('a garbage token: 401', (await call('GET', '/api/mobile/v1/me', undefined, 'abcdefghijklmnopqrstuvwxyz.abc.def')).status === 401)
  const me = await call('GET', '/api/mobile/v1/me', undefined, token)
  check('me answers with user and store', me.status === 200 && me.json.user.email === EMAIL && !!me.json.store.currency, me.json)
  check('answers are private, not cached', (me.headers.get('cache-control') || '').includes('no-store'), me.headers.get('cache-control'))
  check('password hash and 2-step secret never leave the server', !JSON.stringify(me.json).match(/passwordHash|totpSecret|totpBackupCodes/))
  fixture('me', me.json)

  console.log('Products and stock')
  const products = await call('GET', '/api/admin/products?status=ALL&page=1&pageSize=24', undefined, token)
  check('existing admin products endpoint works with the app token', products.status === 200 && products.json.rows.length > 0, products.status)
  fixture('products', products.json)
  // Active products with stock to sell, most first (other tests may have sold some out).
  const available = (p: any) => [...p.inventory, ...p.variants.flatMap((v: any) => v.inventory)].reduce((n: number, i: any) => n + i.quantity - i.reserved, 0)
  const active = products.json.rows.filter((p: any) => p.status === 'ACTIVE' && !p.name.startsWith('E2E') && p.variants.length === 0 && available(p) >= 3).sort((a: any, b: any) => available(b) - available(a))
  const product = await call('GET', `/api/admin/products/${active[0].id}`, undefined, token)
  check('product detail', product.status === 200 && product.json.product.id === active[0].id)
  fixture('product', product.json)
  const collections = await call('GET', '/api/admin/collections?take=200', undefined, token)
  check('collections', collections.status === 200 && Array.isArray(collections.json.rows))
  fixture('collections', collections.json)

  const created = await call('POST', '/api/admin/products', { name: 'E2E Test Mop', sku: `E2E-${Date.now()}`, basePrice: 1250, compareAtPrice: null, costPrice: 600, status: 'DRAFT', tags: ['e2e'], collectionIds: [], images: [], quantity: 7, lowStockThreshold: 3, trackInventory: true, continueSellingWhenOutOfStock: false }, token)
  check('create product (as the app sends it)', created.status === 201 && !!created.json.product.id, created.json)
  const pid = created.json.product.id
  const edited = await call('PATCH', `/api/admin/products/${pid}`, { name: 'E2E Test Mop Pro', sku: created.json.product.sku, barcode: '', basePrice: 1500, compareAtPrice: 1900, costPrice: null, featured: true, brand: 'Yalla', vendor: '', productType: 'Cleaning', tags: ['e2e', 'mop'], collectionIds: [], images: [{ url: '/placeholder-product.svg' }], trackInventory: true, continueSellingWhenOutOfStock: false, shortDescription: 'Short' }, token)
  const after = await call('GET', `/api/admin/products/${pid}`, undefined, token)
  check('edit product (partial fields)', edited.status === 200 && after.json.product.basePrice === 1500 && after.json.product.compareAtPrice === 1900 && after.json.product.costPrice === null && after.json.product.images.length === 1, { edited: edited.json, after: after.json?.product })
  const activate = await call('PATCH', `/api/admin/products/${pid}`, { status: 'ACTIVE', publishedAt: new Date().toISOString() }, token)
  check('activate product', activate.status === 200)

  const inv = await call('GET', '/api/mobile/v1/inventory?filter=all&page=1&q=E2E', undefined, token)
  check('stock list with search', inv.status === 200 && inv.json.items.some((i: any) => i.productId === pid), inv.json)
  fixture('inventory', inv.json)
  const row = inv.json.items.find((i: any) => i.productId === pid)
  const adj = await call('PATCH', '/api/admin/inventory', { id: row.id, delta: -5, reason: 'Stock count correction', movementType: 'ADJUSTMENT', lowStockThreshold: 3 }, token)
  check('adjust stock down', adj.status === 200 && adj.json.item.quantity === 2, adj.json)
  const tooLow = await call('PATCH', '/api/admin/inventory', { id: row.id, delta: -50, reason: 'x' }, token)
  check('stock cannot go below zero/reserved', tooLow.status === 409, tooLow.json)
  const low = await call('GET', '/api/mobile/v1/inventory?filter=low&page=1', undefined, token)
  check('low filter finds it', low.json.items.some((i: any) => i.id === row.id), low.json.summary)
  const damage = await call('PATCH', '/api/admin/inventory', { id: row.id, delta: 0, reason: 'Damaged', movementType: 'DAMAGE', lowStockThreshold: 3 }, token)
  check('damage with no reduction is refused', damage.status === 409 || damage.status === 400, damage)

  console.log('Orders')
  const manual = await call('POST', '/api/admin/orders/manual', { items: [{ productId: pid, quantity: 1 }], name: 'Rana Haddad', phone: '+96170123456', line1: 'Hamra St', city: 'Beirut', paymentMethod: 'COD' }, token)
  check('create a test order', manual.status === 201 || manual.status === 200, manual.json)
  const paidManual = await call('POST', '/api/admin/orders/manual', { items: [{ productId: active[0].id, quantity: 2 }], name: 'Sami Khoury', phone: '+96171000000', line1: 'Gemmayze', city: 'Beirut', paymentMethod: 'BANK_TRANSFER' }, token)
  check('create a second test order', paidManual.status === 201 || paidManual.status === 200, paidManual.json)
  const list = await call('GET', '/api/admin/orders?page=1&limit=30&counts=1', undefined, token)
  check('orders list with counts', list.status === 200 && list.json.rows.length >= 2 && !!list.json.counts, list.status)
  fixture('orders', list.json)
  const search = await call('GET', '/api/admin/orders?page=1&limit=30&counts=1&q=Rana', undefined, token)
  check('order search by name', search.json.rows.length >= 1 && search.json.rows.every((o: any) => /Rana/i.test(o.shippingAddressJson)), search.json.rows.length)
  const orderId = (manual.json.order ?? manual.json).id ?? search.json.rows[0].id
  const detail = await call('GET', `/api/mobile/v1/orders/${orderId}`, undefined, token)
  check('order detail with actions', detail.status === 200 && detail.json.order.customer.name === 'Rana Haddad' && detail.json.actions.nextStatuses.includes('CONFIRMED'), detail.json)
  fixture('order', detail.json)
  check('missing order is 404', (await call('GET', '/api/mobile/v1/orders/nope', undefined, token)).status === 404)
  for (const status of ['CONFIRMED', 'PROCESSING']) {
    const s = await call('PATCH', '/api/admin/orders', { id: orderId, status }, token)
    check(`move order to ${status}`, s.status === 200 && s.json.order.status === status, s.json)
  }
  const skip = await call('PATCH', '/api/admin/orders', { id: orderId, status: 'PENDING' }, token)
  check('an invalid transition is refused', skip.status === 400, skip.json)
  const ship = await call('PATCH', '/api/admin/orders', { id: orderId, status: 'SHIPPED', trackingNumber: 'TRK123', trackingCompany: 'Yalla Couriers', trackingUrl: 'https://track.example/TRK123' }, token)
  check('send out for delivery with tracking', ship.status === 200 && ship.json.order.status === 'SHIPPED' && ship.json.order.trackingNumber === 'TRK123', ship.json)
  const badUrl = await call('PATCH', '/api/admin/orders', { id: orderId, trackingUrl: 'javascript:alert(1)' }, token)
  check('a non-web tracking link is refused', badUrl.status === 400, badUrl.json)
  const note = await call('PATCH', '/api/admin/orders', { id: orderId, addNote: 'Customer asked for evening delivery' }, token)
  check('add a staff note', note.status === 201, note.json)
  const deliver = await call('PATCH', '/api/admin/orders', { id: orderId, status: 'DELIVERED' }, token)
  check('deliver: cash on delivery becomes paid', deliver.status === 200 && deliver.json.order.paymentStatus === 'PAID', deliver.json)
  const otherId = (paidManual.json.order ?? paidManual.json).id
  const paid = await call('PATCH', '/api/admin/orders', { id: otherId, paymentStatus: 'PAID' }, token)
  check('mark a bank transfer as paid', paid.status === 200 && paid.json.order.paymentStatus === 'PAID', paid.json)
  const cancel = await call('PATCH', '/api/admin/orders', { id: otherId, status: 'CANCELLED' }, token)
  check('cancel a paid order (owner): refunded', cancel.status === 200 && cancel.json.order.status === 'CANCELLED' && !!cancel.json.cancelRefund, cancel.json)
  const timeline = await call('GET', `/api/mobile/v1/orders/${orderId}`, undefined, token)
  check('timeline, notes and shipment recorded', timeline.json.order.events.length >= 4 && timeline.json.order.staffNotes.length === 1 && timeline.json.order.fulfillments.length === 1, timeline.json.order)

  console.log('Dashboard')
  for (const range of [7, 30, 90]) {
    const d = await call('GET', `/api/mobile/v1/dashboard?range=${range}`, undefined, token)
    check(`dashboard (${range} days)`, d.status === 200 && d.json.daily.length === range && d.json.orders.total >= 2, d.json)
    if (range === 30) {
      fixture('dashboard', d.json)
      check('dashboard counts today\'s revenue', d.json.revenue.today > 0 && d.json.orders.completed >= 1 && d.json.orders.cancelled >= 1, d.json.revenue)
      check('dashboard best sellers and recent orders', d.json.bestSellers.length > 0 && d.json.recentOrders.length >= 2)
    }
  }

  console.log('Customers and discounts')
  const customers = await call('GET', '/api/admin/customers?page=1&pageSize=25', undefined, token)
  check('customers list', customers.status === 200 && Array.isArray(customers.json.rows), customers.json)
  fixture('customers', customers.json)
  if (customers.json.rows[0]) {
    const c = await call('GET', `/api/admin/customers/${customers.json.rows[0].id}`, undefined, token)
    check('customer detail', c.status === 200 && !!c.json.customer.id)
    fixture('customer', c.json)
  }
  const codeName = `E2E${Date.now().toString(36).toUpperCase()}`
  const coupon = await call('POST', '/api/admin/coupons', { code: codeName, type: 'PERCENTAGE', value: 15, isAutomatic: false, minSubtotal: 2000, maxUses: 50, startsAt: null, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), firstOrderOnly: false, oncePerCustomer: true, isActive: true, appliesTo: 'ALL_PRODUCTS' }, token)
  check('create discount', coupon.status === 201 && coupon.json.coupon.code === codeName, coupon.json)
  const dup = await call('POST', '/api/admin/coupons', { code: codeName, type: 'PERCENTAGE', value: 10 }, token)
  check('duplicate code refused with 409', dup.status === 409, dup.json)
  const badPct = await call('POST', '/api/admin/coupons', { code: codeName + 'X', type: 'PERCENTAGE', value: 150 }, token)
  check('percentage over 100 refused', badPct.status === 400, badPct.json)
  const off = await call('PATCH', '/api/admin/coupons', { id: coupon.json.coupon.id, isActive: false }, token)
  check('turn discount off', off.status === 200 && off.json.coupon.isActive === false)
  const all = await call('GET', '/api/admin/coupons', undefined, token)
  check('discounts list', Array.isArray(all.json) && all.json.some((c: any) => c.id === coupon.json.coupon.id))
  fixture('coupons', all.json)
  const del = await call('DELETE', `/api/admin/coupons?id=${coupon.json.coupon.id}`, undefined, token)
  check('delete discount', del.status === 200)

  console.log('Alerts and this phone')
  const reg = await call('PUT', '/api/mobile/v1/devices', { installId: INSTALL, fcmToken: null, appVersion: '1.0.0', model: 'samsung SM-S9xx' }, token)
  check('register this phone', reg.status === 200 && reg.json.registered === true, reg.json)
  const prefs = await call('PUT', '/api/mobile/v1/devices', { installId: INSTALL, prefs: { summary: false } }, token)
  check('save alert preferences', prefs.json.prefs.summary === false && prefs.json.prefs.orders === true, prefs.json)
  // A new order now: the staff alert also reaches the app history.
  await call('POST', '/api/admin/orders/manual', { items: [{ productId: pid, quantity: 1 }], name: 'Alert Test', phone: '+96170999999', line1: 'Test', city: 'Beirut' }, token)
  const test = await call('POST', '/api/mobile/v1/devices', { test: true }, token)
  check('test alert answers', test.status === 200, test.json)
  // Low stock: adjusting the test product down sends a low-stock staff alert.
  const restock = await call('PATCH', '/api/admin/inventory', { id: row.id, delta: 3, reason: 'Received stock' }, token)
  const lower = await call('PATCH', '/api/admin/inventory', { id: row.id, delta: -1, reason: 'Stock count correction' }, token)
  check('restock then lower stock', restock.status === 200 && lower.status === 200, { restock: restock.json, lower: lower.json })
  await new Promise(r => setTimeout(r, 1500))
  const alerts = await call('GET', '/api/mobile/v1/notifications', undefined, token)
  check('alert history has the low-stock alert', alerts.status === 200 && alerts.json.items.some((a: any) => a.kind === 'lowStock'), alerts.json)
  fixture('alerts', alerts.json)
  const markAll = await call('POST', '/api/mobile/v1/notifications', { all: true }, token)
  const afterMark = await call('GET', '/api/mobile/v1/notifications', undefined, token)
  check('mark all read', markAll.status === 200 && afterMark.json.unread === 0, afterMark.json.unread)
  const since = await call('GET', `/api/mobile/v1/notifications?since=${encodeURIComponent(new Date().toISOString())}`, undefined, token)
  check('since returns only newer alerts', since.json.items.length === 0)
  const device = await deviceState(token)
  check('this phone reads its own settings', device.registered === true && device.prefs.summary === false, device)
  fixture('device', device)

  console.log('Permissions')
  const support = await signIn('support@example.com')
  check('support staff can sign in', !!support.token, support.codeRes?.json)
  if (support.token) {
    const sp = await call('POST', '/api/admin/products', { name: 'x', sku: 'x' }, support.token)
    check('support cannot create products (403)', sp.status === 403, sp.json)
    const sc = await call('POST', '/api/admin/coupons', { code: 'NOPE', type: 'PERCENTAGE', value: 10 }, support.token)
    check('support cannot create discounts (403)', sc.status === 403, sc.json)
    const so = await call('GET', '/api/admin/orders?page=1', undefined, support.token)
    check('support can read orders', so.status === 200)
  }

  console.log('Sign-out')
  const out = await call('POST', '/api/mobile/v1/auth/logout', { installId: INSTALL }, token)
  check('sign out removes this phone', out.status === 200 && (await deviceState(token)).registered === false)
  const everywhere = await call('POST', '/api/mobile/v1/auth/logout', { everywhere: true }, token)
  await new Promise(r => setTimeout(r, 1100))
  check('sign out everywhere', everywhere.status === 200)
  check('the old token is revoked (401)', (await call('GET', '/api/mobile/v1/me', undefined, token)).status === 401)
  check('a support token survives another account\'s revocation', !support.token || (await call('GET', '/api/mobile/v1/me', undefined, support.token)).status === 200)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch(error => { console.error(error); process.exit(1) })

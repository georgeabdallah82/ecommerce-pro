// The store's critical paths, checked on a real store and database (scripts/e2e/write-path.mjs runs them, in the
// PostgreSQL staging check on every pull request): what each step answers, and what it left in the database.
//
// - Customer sign-in: a wrong password is refused, the right one signs in, signing out ends the session.
// - An order's life: confirmed, preparing, out for delivery (the stock leaves, a shipment is recorded), delivered
//   (cash on delivery: paid). A step backwards is refused.
// - Refunds: refused until staff confirm it is them, refused above what was paid, then a partial and a full refund.
// - Cancelling: before it ships the held stock is freed; after it ships the stock comes back.
// - Overselling: more than is in stock is refused, and two shoppers racing for the last one get it once.
// - Staff sign-in: the password alone opens nothing, a wrong code is refused, a code works once.
//
// Throwaway data only: its own product and orders, on the runner's own database (DATABASE_URL).
import pg from 'pg'
import { createHmac } from 'node:crypto'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function query(text, params = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try { return (await client.query(text, params)).rows } finally { await client.end() }
}
const one = async (text, params) => (await query(text, params))[0]

// RFC 6238 codes, as the 2-step app shows them.
function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const out = []
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const i = alphabet.indexOf(ch)
    if (i < 0) continue
    value = ((value << 5) | i) & 0xffff
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}
export const totpStep = (ms = Date.now()) => Math.floor(ms / 30000)
export function totpCode(secret, step = totpStep()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0x0f
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0')
}

const session = page => page.evaluate(async () => { const r = await fetch('/api/auth/session', { cache: 'no-store' }); return r.json().catch(() => ({})) })

// ---------- Customer sign-in, through the real form
export async function customerSignIn({ browser, B, step, email, password }) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    const signIn = async pass => {
      await page.goto(B + '/account/login', { waitUntil: 'networkidle' })
      await page.locator('form.authForm input[name=email]').fill(email)
      await page.locator('form.authForm input[name=password]').fill(pass)
      await Promise.all([page.waitForURL(u => u.pathname !== '/account/login' || u.searchParams.has('error'), { timeout: 30000 }).catch(() => {}), page.locator('form.authForm button.authSubmit').click()])
      await page.waitForLoadState('networkidle')
    }
    await signIn(password + 'x')
    const refused = await session(page)
    step('sign-in: a wrong password is refused', new URL(page.url()).searchParams.get('error') === 'invalid' && !refused?.user, `url=${page.url().slice(B.length)} user=${refused?.user?.email || 'none'}`)
    await signIn(password)
    const signedIn = await session(page)
    step('sign-in: the right password signs the customer in', signedIn?.user?.email === email && new URL(page.url()).pathname.startsWith('/account'), `url=${page.url().slice(B.length)} user=${signedIn?.user?.email || 'none'}`)
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => null))
    const after = await session(page)
    step('sign-in: signing out ends the session', !after?.user, `user=${after?.user?.email || 'none'}`)
  } finally { await ctx.close() }
}

// ---------- Orders, refunds, cancelling and stock
export async function orderPaths({ B, step, api, shopPage, checkoutRequest, stamp, adminPassword }) {
  if (!checkoutRequest) { step('orders: the checkout page sent an order to copy', false, 'no checkout request was seen'); return }
  // A product of its own with 3 in stock, so every count below is exact.
  const made = await api('/api/admin/products', 'POST', { name: `Critical path ${stamp}`, sku: `CP-${stamp}`, basePrice: 2500, status: 'ACTIVE', trackInventory: true, quantity: 3 })
  const productId = (made.body?.product || made.body)?.id
  step('orders: a product with 3 in stock', made.status === 201 && !!productId, `http=${made.status} ${made.body?.error || ''}`)
  if (!productId) return
  const stock = () => one(`SELECT quantity, reserved FROM "InventoryItem" WHERE "productId" = $1 AND "variantId" IS NULL`, [productId])
  const orderRow = number => one(`SELECT id, status, "paymentStatus", "fulfillmentStatus", "grandTotal" FROM "Order" WHERE "orderNumber" = $1`, [number])
  const show = s => s ? `quantity ${s.quantity}, held ${s.reserved}` : 'no stock row'
  // An order the way the checkout page sends one (copied from the page's own request), for this product.
  const place = quantity => shopPage.evaluate(async ([body, productId, quantity]) => {
    const { expectedTotal: _total, couponCode: _code, ...rest } = body
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ ...rest, items: [{ productId, variantId: null, quantity }] }) })
    const answer = await r.json().catch(() => ({}))
    return { status: r.status, number: answer?.order?.orderNumber || '', error: answer?.error || '' }
  }, [checkoutRequest, productId, quantity])
  const move = async (number, status, body = {}) => {
    const row = await orderRow(number)
    return api('/api/admin/orders', 'PATCH', { id: row?.id, status, ...body })
  }

  // 1. The life of an order: cash on delivery, from placed to delivered.
  const a = await place(1)
  let s = await stock()
  step('orders: checkout holds the stock it sold', !!a.number && s?.quantity === 3 && s?.reserved === 1, `#${a.number || '-'} http=${a.status} ${a.error} ${show(s)}`)
  if (!a.number) return
  for (const status of ['CONFIRMED', 'PROCESSING']) {
    const r = await move(a.number, status)
    step(`orders: ${status.toLowerCase()}`, r.status === 200 && (await orderRow(a.number))?.status === status, `http=${r.status} ${r.body?.error || ''}`)
  }
  const shipped = await move(a.number, 'SHIPPED', { trackingNumber: `CP${stamp}` })
  s = await stock()
  const parcel = await one(`SELECT f.status, count(l.id)::int AS lines FROM "Fulfillment" f LEFT JOIN "FulfillmentLine" l ON l."fulfillmentId" = f.id WHERE f."orderId" = $1 GROUP BY f.id`, [(await orderRow(a.number)).id])
  step('orders: out for delivery takes the stock and records the shipment', shipped.status === 200 && s?.quantity === 2 && s?.reserved === 0 && parcel?.status === 'SHIPPED' && parcel?.lines === 1, `http=${shipped.status} ${shipped.body?.error || ''} ${show(s)} shipment=${JSON.stringify(parcel || null)}`)
  const delivered = await move(a.number, 'DELIVERED')
  let row = await orderRow(a.number)
  step('orders: delivered, and cash on delivery is marked paid', delivered.status === 200 && row?.status === 'DELIVERED' && row?.paymentStatus === 'PAID' && row?.fulfillmentStatus === 'FULFILLED', `http=${delivered.status} ${JSON.stringify(row)}`)
  const backwards = await move(a.number, 'CONFIRMED')
  step('orders: a delivered order cannot go back a step', backwards.status === 400 && (await orderRow(a.number))?.status === 'DELIVERED', `http=${backwards.status} ${backwards.body?.error || ''}`)

  // 2. Refunds of the delivered order: guarded, partial, never more than was paid, then full.
  const refunds = async () => (await one(`SELECT count(*)::int AS n, coalesce(sum(amount), 0)::int AS total FROM "PaymentTransaction" WHERE "orderId" = $1 AND status = 'refunded'`, [row.id]))
  const refund = amount => api('/api/admin/refunds', 'POST', { orderId: row.id, amount, reason: 'Critical path check' })
  const unconfirmed = await refund(500)
  step('refunds: refused until staff confirm it is them', unconfirmed.status === 403 && unconfirmed.body?.code === 'REAUTH_REQUIRED' && (await refunds()).n === 0, `http=${unconfirmed.status} ${unconfirmed.body?.code || unconfirmed.body?.error || ''}`)
  const wrong = await api('/api/admin/reauth', 'POST', { password: adminPassword + 'x' })
  const confirmed = await api('/api/admin/reauth', 'POST', { password: adminPassword })
  step('refunds: confirming with a wrong password is refused, the right one works', wrong.status === 401 && confirmed.status === 200, `wrong=${wrong.status} right=${confirmed.status}`)
  const partial = await refund(500)
  row = await orderRow(a.number)
  step('refunds: a partial refund is recorded', partial.status === 201 && row?.paymentStatus === 'PARTIALLY_REFUNDED' && row?.status === 'DELIVERED' && (await refunds()).total === 500, `http=${partial.status} ${partial.body?.error || ''} ${JSON.stringify(row)}`)
  const tooMuch = await refund(row.grandTotal - 500 + 1)
  step('refunds: more than what is left to refund is refused', tooMuch.status === 400 && (await refunds()).total === 500, `http=${tooMuch.status} ${tooMuch.body?.error || ''}`)
  const rest = await refund(row.grandTotal - 500)
  row = await orderRow(a.number)
  const refunded = await refunds()
  s = await stock()
  step('refunds: the rest is refunded, the order is refunded in full', rest.status === 201 && row?.paymentStatus === 'REFUNDED' && row?.status === 'REFUNDED' && refunded.total === row.grandTotal && refunded.n === 2, `http=${rest.status} ${rest.body?.error || ''} refunded=${refunded.total} of ${row?.grandTotal}`)
  step('refunds: a refund alone does not put stock back', s?.quantity === 2 && s?.reserved === 0, show(s))

  // 3. Cancelling: before it ships, then after it ships.
  const b = await place(1)
  const cancelled = b.number ? await move(b.number, 'CANCELLED') : { status: 0, body: null }
  s = await stock()
  step('cancel: before shipping, the held stock is freed', cancelled.status === 200 && s?.quantity === 2 && s?.reserved === 0 && (await orderRow(b.number))?.status === 'CANCELLED', `#${b.number || '-'} http=${cancelled.status} ${cancelled.body?.error || ''} ${show(s)}`)
  const c = await place(1)
  for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED']) if (c.number) await move(c.number, status)
  const afterShip = await stock()
  const returned = c.number ? await move(c.number, 'CANCELLED') : { status: 0, body: null }
  s = await stock()
  const parcels = c.number ? await one(`SELECT string_agg(status::text, ',') AS statuses FROM "Fulfillment" WHERE "orderId" = $1`, [(await orderRow(c.number)).id]) : null
  step('cancel: after shipping, the stock comes back and the shipment is cancelled', returned.status === 200 && afterShip?.quantity === 1 && s?.quantity === 2 && s?.reserved === 0 && parcels?.statuses === 'CANCELLED', `#${c.number || '-'} http=${returned.status} ${returned.body?.error || ''} shipped: ${show(afterShip)}; cancelled: ${show(s)} shipments=${parcels?.statuses}`)

  // 4. Overselling: 2 left.
  const ordersBefore = (await one(`SELECT count(*)::int AS n FROM "Order"`)).n
  const over = await place(3)
  s = await stock()
  step('stock: ordering more than is left is refused, nothing is held', over.status === 409 && !over.number && s?.reserved === 0 && (await one(`SELECT count(*)::int AS n FROM "Order"`)).n === ordersBefore, `http=${over.status} ${over.error} ${show(s)}`)
  const d = await place(1)
  // The last one: two shoppers at the same moment. One gets it, the other is told it is gone.
  const race = await Promise.all([place(1), place(1)])
  s = await stock()
  const won = race.filter(r => r.number), lost = race.filter(r => !r.number)
  step('stock: two shoppers racing for the last one, it is sold once', !!d.number && won.length === 1 && lost.length === 1 && lost[0].status === 409 && s?.quantity === 2 && s?.reserved === 2, `answers=${race.map(r => r.status).join(',')} ${show(s)}`)
}

// ---------- Staff sign-in: password, then the 2-step code
export async function staffSignIn({ browser, B, step, email, password, totpSecret, lastStep }) {
  if (!totpSecret) { console.log('INFO staff sign-in: skipped (this admin already had 2-step login, so the test has no code)'); return }
  const passwordStep = (page, pass) => page.evaluate(async ([email, pass]) => {
    const form = new FormData(); form.set('email', email); form.set('password', pass)
    const r = await fetch('/api/admin/login', { method: 'POST', body: form })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, [email, pass])
  const codeStep = (page, code) => page.evaluate(async code => {
    const r = await fetch('/api/admin/login/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, code)
  const ctx = await browser.newContext(), other = await browser.newContext()
  try {
    const page = await ctx.newPage(); await page.goto(B + '/admin-login', { waitUntil: 'networkidle' })
    const refused = await passwordStep(page, password + 'x')
    step('staff sign-in: a wrong password is refused', refused.status === 401 && !(await session(page))?.user, `http=${refused.status} ${refused.body?.error || ''}`)
    const first = await passwordStep(page, password)
    const noSession = await session(page)
    step('staff sign-in: the password alone asks for the code and opens nothing', first.status === 200 && first.body?.needsCode === true && !noSession?.user, `http=${first.status} ${JSON.stringify(first.body)} user=${noSession?.user?.email || 'none'}`)
    const wrongCode = await codeStep(page, totpCode(totpSecret, totpStep() + 20))
    step('staff sign-in: a wrong code is refused', wrongCode.status === 401 && !(await session(page))?.user, `http=${wrongCode.status} ${wrongCode.body?.error || ''}`)
    // A code works once: wait for one the store has not seen yet.
    while (totpStep() <= lastStep) await sleep(500)
    const code = totpCode(totpSecret)
    const right = await codeStep(page, code)
    const signedIn = await session(page)
    const adminPage = await page.goto(B + '/admin', { waitUntil: 'networkidle' })
    step('staff sign-in: the right code signs in and opens admin', right.status === 200 && signedIn?.user?.email === email && adminPage?.status() === 200 && !/admin-login/.test(page.url()), `http=${right.status} ${right.body?.error || ''} user=${signedIn?.user?.email || 'none'} page=${adminPage?.status()} ${page.url().slice(B.length)}`)
    const page2 = await other.newPage(); await page2.goto(B + '/admin-login', { waitUntil: 'networkidle' })
    const again = await passwordStep(page2, password)
    const reused = again.body?.needsCode ? await codeStep(page2, code) : { status: 0, body: null }
    step('staff sign-in: the same code cannot be used twice', reused.status === 401 && !(await session(page2))?.user, `http=${reused.status} ${reused.body?.error || ''}`)
  } finally { await ctx.close(); await other.close() }
}

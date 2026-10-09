// End-to-end test of the store's write paths: checkout, customer account, and the admin actions
// that save data (orders, products, collections, coupons, theme, settings, files, customers).
// Used by .github/workflows/postgres-migration.yml against a rehearsal copy of the store running
// locally on the runner (wrangler dev) -- never against the live site.
//
//   BASE=http://127.0.0.1:8787 ADMIN_EMAIL=... ADMIN_PASSWORD=... PRODUCT_PATH=/product/x node scripts/e2e/write-path.mjs
//
// Needs playwright-core (installed by the workflow, not a project dependency); CHROMIUM_PATH
// points it at a browser binary when the default download isn't used.
import { chromium } from 'playwright-core'
const B = process.env.BASE || 'http://127.0.0.1:8787'
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
if (!ADMIN.email || !ADMIN.password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required')
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
let failures = 0
const step = (name, ok, note = '') => { if (!ok) failures++; console.log(ok ? 'PASS' : 'FAIL', name, note) }
const stamp = Date.now().toString(36)
// Rehearsal diagnostics on a preview version (PROBE_DB=1): the database error, if any, in full.
const probe = async label => { if (!process.env.PROBE_DB) return; const r = await fetch(B + '/api/internal/db-probe').catch(e => null); console.log(`db probe (${label}):`, r ? r.status : 'no answer', r ? (await r.text()).slice(0, 3000) : '') }

// ---------- Shopper: add to cart, cash-on-delivery checkout
const shop = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await shop.route(/facebook|tiktok|googletagmanager|google-analytics/, r => r.abort())
const sp = await shop.newPage()
const shopErrors = []; sp.on('pageerror', e => shopErrors.push(String(e).slice(0, 150)))
const productPath = process.env.PRODUCT_PATH || await (async () => { await sp.goto(B + '/shop', { waitUntil: 'networkidle' }); return sp.evaluate(() => [...document.querySelectorAll('a[href^="/product/"]')].map(a => a.getAttribute('href'))[0]) })()
await sp.goto(B + productPath, { waitUntil: 'networkidle' })
const productName = (await sp.locator('h1').first().innerText()).trim()
await sp.locator('button.aliAddToCart').first().click()
await sp.waitForTimeout(1200)
await sp.goto(B + '/checkout', { waitUntil: 'networkidle' })
await sp.locator('[name=email]').fill(`pg-e2e-${stamp}@example.com`)
await sp.locator('[name=firstName]').fill('Postgres')
await sp.locator('[name=lastName]').fill('Test')
await sp.locator('[name=phone]').fill('70 123 456')
await sp.locator('[name=line1]').fill('Test street 1')
await sp.locator('[name=city]').fill('Beirut')
const country = sp.locator('[name=country]'); if (!(await country.inputValue())) await country.fill('Lebanon')
await sp.waitForTimeout(1500)
// Whatever else the store's checkout settings require (a delivery area, a time slot...): pick the
// first option of every required, still-empty select.
await sp.evaluate(() => { for (const el of document.querySelectorAll('form select[required]')) if (!el.value) { const o = [...el.options].find(o => o.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })) } } })
await sp.waitForTimeout(800)
await sp.locator('button[type=submit]', { hasText: /place order/i }).first().click()
let orderNumber = ''
try {
  await sp.waitForURL(/\/order\/success/, { timeout: 60000 })
  const card = await sp.locator('.successCard').innerText()
  orderNumber = (card.match(/#(ORD-[A-Z0-9-]+)/) || [])[1] || ''
  step('checkout places an order (nested create + stock reservation in a transaction)', !!orderNumber, orderNumber)
  await sp.locator('a', { hasText: 'View order' }).click(); await sp.waitForLoadState('networkidle')
  step('guest view-order link', (await sp.locator('main').innerText()).includes(orderNumber))
} catch (e) { step('checkout places an order', false, String(e).slice(0, 120) + ' :: ' + (await sp.locator('body').innerText()).slice(0, 300)) }

// ---------- Customer account: register, wishlist, newsletter
const cust = await b.newContext(); const cp = await cust.newPage()
await cp.goto(B + '/account/register', { waitUntil: 'networkidle' })
const regForm = cp.locator('form:has(input[name=password])')
const regInputs = await regForm.locator('input').evaluateAll(els => els.filter(e => e.type !== 'hidden' && e.offsetParent !== null).map(e => e.getAttribute('name')))
for (const name of regInputs) {
  const el = regForm.locator(`input[name="${name}"]`)
  if (/email/i.test(name)) await el.fill(`pg-cust-${stamp}@example.com`)
  else if (/password/i.test(name)) await el.fill('Secret123!pg')
  else if (/phone/i.test(name)) await el.fill('70 765 432')
  else if (/name/i.test(name)) await el.fill('PG Customer')
}
await regForm.locator('button', { hasText: 'Create account' }).first().click()
// The form posts in the background and then redirects to the account page; the session cookie
// is set by that response, so wait for the redirect rather than a fixed delay.
await cp.waitForURL(u => !u.pathname.startsWith('/account/register'), { timeout: 60000 }).catch(() => {})
const session = await cp.evaluate(async () => { const r = await fetch('/api/auth/session'); return r.json().catch(() => ({ status: r.status })) })
step('customer registration + session', !!session?.user?.email, `fields=${regInputs.join(',')} user=${session?.user?.email || JSON.stringify(session).slice(0, 80)}`)
const productId = await cp.evaluate(async path => { const r = await fetch('/api/products?limit=50'); const j = await r.json().catch(() => null); const list = j?.products || j?.rows || j || []; const slug = path.split('/').pop(); return (list.find?.(p => p.slug === slug) || list[0])?.id || '' }, productPath)
const wish = await cp.evaluate(async id => { const r = await fetch('/api/wishlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: id }) }); return r.status + ' ' + (await r.text()).slice(0, 80) }, productId)
step('wishlist add', wish.startsWith('200') || wish.startsWith('201'), wish)
const news = await cp.evaluate(async email => { const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }); return r.status + ' ' + (await r.text()).slice(0, 80) }, `pg-news-${stamp}@example.com`)
step('newsletter signup', /^20[01]/.test(news), news)

// ---------- Admin
const admin = await b.newContext({ viewport: { width: 1366, height: 900 } }); const ap = await admin.newPage()
const adminErrors = []; ap.on('pageerror', e => adminErrors.push(String(e).slice(0, 150)))
await ap.goto(B + '/admin-login', { waitUntil: 'networkidle' })
await ap.locator('input[name=email]').fill(ADMIN.email); await ap.locator('input[name=password]').fill(ADMIN.password); await ap.locator('button.adminLoginSubmit').click()
await ap.waitForURL(/\/admin(?!-login)/, { timeout: 60000 }); step('admin login', true)
const api = (url, method = 'GET', body) => ap.evaluate(async ([url, method, body]) => { const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) } }, [url, method, body])

// Many requests at once, the way the admin and a busy storefront load: each request must only
// ever wait on its own database queries (a database client shared between requests let one
// request's lookup ride on another's and the Worker runtime cancelled it as hung).
const burst = await ap.evaluate(async productPath => {
  const urls = []
  for (let i = 0; i < 6; i++) urls.push('/api/auth/session', '/api/admin/pages', '/api/admin/collections', '/api/admin/coupons', productPath)
  const results = await Promise.all(urls.map(u => fetch(u, { cache: 'no-store' }).then(r => r.status, () => 0)))
  return results.map((status, i) => [urls[i], status]).filter(([, status]) => status !== 200)
}, productPath)
step('concurrent requests (30 at once)', burst.length === 0, burst.map(([u, s]) => `${u}=${s}`).join(' '))
await probe('after 30 concurrent requests')

for (const p of ['/admin', '/admin/orders', '/admin/products', '/admin/customers', '/admin/reports', '/admin/inventory', '/admin/settings', '/admin/online-store/theme-editor', '/admin/customer-segments']) {
  const r = await ap.goto(B + p, { waitUntil: 'networkidle' }).catch(() => null)
  const text = await ap.locator('body').innerText().catch(() => '')
  step(`admin page ${p}`, r?.status() === 200 && !/request failed|something went wrong|unable to load/i.test(text), `status=${r?.status()}`)
}

if (orderNumber) {
  const found = await api(`/api/admin/orders?q=${orderNumber}`)
  const order = (found.body?.rows || []).find(o => o.orderNumber === orderNumber)
  step('order visible in admin list', !!order, `total=${order?.grandTotal} status=${order?.status}`)
  if (order) {
    const page = await ap.goto(`${B}/admin/orders/${order.id}`, { waitUntil: 'networkidle' })
    step('admin order detail page', page?.status() === 200 && (await ap.locator('body').innerText()).includes(orderNumber))
    const note = await api('/api/admin/orders', 'PATCH', { id: order.id, addNote: 'Postgres e2e note' })
    step('add order note', note.status === 201, `http=${note.status}`)
    const cancel = await api('/api/admin/orders', 'PATCH', { id: order.id, status: 'CANCELLED' })
    step('cancel order (reverses stock/coupon in a transaction)', cancel.status === 200 && cancel.body?.order?.status === 'CANCELLED', `http=${cancel.status} ${cancel.body?.error || ''}`)
  }
}

// Products: create (Arabic name -> slug), update, delete
const created = await api('/api/admin/products', 'POST', { name: 'منتج تجريبي ' + stamp, sku: 'PG-' + stamp, basePrice: 1500, status: 'DRAFT' })
const prod = created.body?.product || created.body
step('create product (Arabic name)', created.status === 201 && /^[a-z0-9-]+$/.test(prod?.slug || ''), `http=${created.status} slug=${prod?.slug} ${created.body?.error || ''}`)
if (prod?.id) {
  const upd = await api(`/api/admin/products/${prod.id}`, 'PATCH', { name: 'PG Test Product ' + stamp, basePrice: 1999 })
  step('update product', upd.status === 200, `http=${upd.status} ${upd.body?.error || ''}`)
  const del = await api(`/api/admin/products/${prod.id}`, 'DELETE')
  step('delete product (cascades images/variants/inventory)', del.status === 200, `http=${del.status} ${del.body?.error || ''}`)
}
const col = await api('/api/admin/collections', 'POST', { name: 'أحذية ' + stamp })
const colRow = col.body?.collection || col.body
step('create collection (Arabic name)', col.status === 201 && /^[a-z0-9-]+$/.test(colRow?.slug || ''), `slug=${colRow?.slug} ${col.body?.error || ''}`)

// Coupon create
const coupon = await api('/api/admin/coupons', 'POST', { code: 'PG' + stamp.toUpperCase(), type: 'PERCENTAGE', value: 10, isActive: true })
step('create coupon', coupon.status === 200 || coupon.status === 201, `http=${coupon.status} ${coupon.body?.error || ''}`)

// Theme draft save (array $transaction of upserts)
const theme = await api('/api/admin/theme')
const saveTheme = await api('/api/admin/theme', 'PATCH', { theme: theme.body?.theme, homeSections: theme.body?.homeSections || theme.body?.sections, navigation: theme.body?.navigation, templateKey: 'Home page', editorTemplates: theme.body?.editorTemplates })
step('save theme draft (batch transaction)', saveTheme.status === 200, `http=${saveTheme.status} ${saveTheme.body?.error || ''}`)

// Settings save
const settings = await api('/api/admin/settings', 'PATCH', { settings: { 'store.tagline': 'Postgres test ' + stamp } })
step('save settings', settings.status === 200, `http=${settings.status} ${settings.body?.error || ''}`)

// Media upload + delete (local R2)
const media = await ap.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 4; c.getContext('2d').fillRect(0, 0, 4, 4)
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const fd = new FormData(); fd.append('file', new File([blob], 'pg-test.png', { type: 'image/png' }))
  const up = await fetch('/api/admin/media/upload', { method: 'POST', body: fd }); const ub = await up.json().catch(() => null)
  const del = ub?.asset?.id ? await fetch(`/api/admin/media/${ub.asset.id}`, { method: 'DELETE' }) : null
  return { up: up.status, del: del?.status, err: ub?.error }
})
step('media upload + delete', media.up === 201 && media.del === 200, JSON.stringify(media))

// Delete the registered customer (manual cleanup + cascades)
const cs = await api(`/api/admin/customers?q=pg-cust-${stamp}`)
const customer = (cs.body?.rows || cs.body?.customers || []).find(c => c.email === `pg-cust-${stamp}@example.com`)
if (customer) {
  const del = await api(`/api/admin/customers/${customer.id}`, 'DELETE')
  step('delete customer (with wishlist)', del.status === 200, `http=${del.status} ${del.body?.error || ''}`)
} else step('find registered customer in admin', false, JSON.stringify(cs.body).slice(0, 120))

// The scheduled job that releases stock held by abandoned card checkouts (database reads and
// transactions outside any browser session). Only when the store was started with a CRON_SECRET.
if (process.env.CRON_SECRET) {
  const cron = await fetch(B + '/api/internal/release-expired-reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  step('scheduled job: release expired reservations', cron.status === 200, `http=${cron.status} ${(await cron.text()).slice(0, 80)}`)
}

// Memory: every database client carries about 1 MB that a 128 MB Worker only gets back when the
// client is given back at the end of its request (it used to keep one per request, until error
// 1102). 160 page loads must all succeed; with CRON_SECRET the store's own counters must also show
// every client released afterwards.
{
  const stats = async () => { if (!process.env.CRON_SECRET) return null; const r = await fetch(B + '/api/internal/runtime-stats', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }); return r.ok ? (await r.json()).database : null }
  const load = async path => { const r = await fetch(B + path); await r.arrayBuffer(); return r.status === 200 ? 200 : `${path}=${r.status}` }
  const pages = ['/', '/shop', productPath, '/cart', '/collections']
  const before = await stats()
  const failures = []
  for (let i = 0; i < 100; i++) { const status = await load(pages[i % pages.length]); if (status !== 200) failures.push(status) }
  for (let round = 0; round < 3; round++) failures.push(...(await Promise.all(pages.flatMap(p => [p, p, p, p]).map(load))).filter(s => s !== 200))
  let after = await stats()
  for (let i = 0; i < 20 && after && after.open > 0; i++) { await new Promise(r => setTimeout(r, 500)); after = await stats() }
  const clientsOk = !process.env.CRON_SECRET || (!!after && after.open === 0)
  step(process.env.CRON_SECRET ? '160 page loads, database clients given back' : '160 page loads', failures.length === 0 && clientsOk, `failed=${failures.length}${failures.length ? ' [' + failures.join(',') + ']' : ''}${process.env.CRON_SECRET ? ` before=${JSON.stringify(before)} after=${JSON.stringify(after)}` : ''}`)
}

await probe('end')
step('no browser errors', !shopErrors.length && !adminErrors.length, [...shopErrors, ...adminErrors].join(' | '))
await b.close()
console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
process.exit(failures ? 1 : 0)

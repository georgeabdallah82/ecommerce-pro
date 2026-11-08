// Browser test of the till on a phone-sized screen: open a shift, scan a barcode, attach a customer,
// take payment, print the receipt, then check the sale, the stock and the cost in the database.
//
// Run against a local app with a test database (it writes test data and closes the owner's open shift):
//   BASE_URL=http://localhost:3100 DATABASE_URL=postgresql://... OWNER_EMAIL=... OWNER_PASSWORD=... \
//     node scripts/e2e/pos-till.mjs
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// The project's end-to-end tests use playwright-core (installed in CI); a machine with only a global
// Playwright install is accepted too.
const require = createRequire(import.meta.url)
const { chromium } = (() => {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name) } catch { /* try the next name */ }
  }
  throw new Error('Install playwright-core (npm i -D playwright-core) to run the till browser test.')
})()

const B = process.env.BASE_URL || 'http://localhost:3100'
const OWNER = { email: process.env.OWNER_EMAIL || 'owner@test.local', password: process.env.OWNER_PASSWORD || 'TestPass123!' }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const tag = Date.now().toString(36)
const results = []
const step = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// RFC 6238 codes, the same helper the storefront end-to-end test uses.
function base32Decode(text) {
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
function totpNow(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0x0f
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1000000).padStart(6, '0')
}

// ---------- Test data (unique to this run)
const owner = await prisma.user.findUnique({ where: { email: OWNER.email }, select: { id: true } })
if (!owner) throw new Error(`No staff account ${OWNER.email} in this database`)
// Set up the authenticator again on every run (test database only): the sign-in below then takes the
// first-sign-in path, which hands over the secret this script needs to compute codes.
await prisma.user.update({ where: { id: owner.id }, data: { totpEnabledAt: null } })
// The owner may have a shift left open by an earlier run; close it so this run starts clean.
await prisma.cashierShift.updateMany({ where: { cashierId: owner.id, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date(), expectedCashCents: 0, countedCashCents: 0, discrepancyCents: 0, closeNote: 'Closed by the till browser test' } })
const location = await prisma.storeLocation.create({ data: { name: `Till test ${tag}`, handle: `till-test-${tag}` } })
const register = await prisma.register.create({ data: { name: `Till ${tag}`, locationId: location.id } })
const barcode = `9${Date.now()}`.slice(0, 13)
const product = await prisma.product.create({ data: { name: `Test soap ${tag}`, slug: `test-soap-${tag}`, sku: `TILL-${tag}`, barcode, basePrice: 1250, costPrice: 500, status: 'ACTIVE' } })
await prisma.inventoryItem.create({ data: { productId: product.id, locationId: location.id, quantity: 10, reserved: 0 } })
const customer = await prisma.user.create({ data: { name: `Till customer ${tag}`, email: `till-customer-${tag}@test.local`, passwordHash: 'x', role: 'CUSTOMER' } })

// ---------- Browser, phone-sized
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(String(error).slice(0, 200)))

// Sign in (first sign-in sets up 2-step login, as the storefront end-to-end test does).
await page.goto(`${B}/admin/login`, { waitUntil: 'networkidle' })
await page.locator('input[name=email]').fill(OWNER.email)
await page.locator('input[name=password]').fill(OWNER.password)
await page.locator('button.adminLoginSubmit').click()
let signedIn = await page.waitForURL(url => /\/admin(?!\/login)/.test(url.pathname), { timeout: 15000 }).then(() => true).catch(() => false)
if (!signedIn) {
  const setup = await page.evaluate(async () => (await fetch('/api/admin/login/enroll', { cache: 'no-store' })).json())
  const done = await page.evaluate(async code => (await fetch('/api/admin/login/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json(), totpNow(setup.secret))
  step('two-step set-up on first sign-in', done.ok === true, done.error || '')
  signedIn = done.ok === true
}
step('signed in as staff', signedIn)
if (!signedIn) process.exit(1)

// 1. The till fits a phone screen without sideways scrolling.
await page.goto(`${B}/admin/pos`, { waitUntil: 'networkidle' })
const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
step('till fits a 390px phone screen without sideways scrolling', fits)

// 2. Open a shift on the test register.
await page.locator('select[aria-label="Register"]').selectOption(register.id)
await page.locator('input[aria-label="Opening cash in dollars"]').fill('0')
await page.getByRole('button', { name: 'Open shift' }).click()
await page.getByText('Shift opened.').waitFor({ timeout: 15000 }).catch(() => {})
step('open a shift', await page.getByRole('button', { name: 'Close shift' }).isVisible().catch(() => false))

// 3. Scan the barcode (a keyboard-wedge scanner types it and presses Enter).
const search = page.locator('input[aria-label="Barcode, SKU or product name"]')
await search.fill(barcode)
await search.press('Enter')
await page.getByText(`Test soap ${tag}`).first().waitFor({ timeout: 10000 }).catch(() => {})
step('scan a barcode adds the item to the cart', await page.locator('ul').getByText(`Test soap ${tag}`).first().isVisible().catch(() => false))
step('the total shows $12.50', await page.getByText('$12.50').first().isVisible().catch(() => false))

// 4. Attach the customer.
await page.locator('input[aria-label="Find a customer"]').fill(`Till customer ${tag}`)
await page.getByRole('button', { name: new RegExp(`Till customer ${tag}`) }).first().click({ timeout: 10000 }).catch(() => {})
step('attach a store customer', await page.getByText(`Till customer ${tag}`).first().isVisible().catch(() => false))

// 5. Pay the exact amount in cash and complete the sale.
await page.getByRole('button', { name: 'Fill the remaining amount' }).click()
const complete = page.getByRole('button', { name: 'Complete sale' })
await complete.click()
const saleStatus = page.locator('[role=status]').filter({ hasText: 'Sale complete' })
await saleStatus.waitFor({ timeout: 20000 }).catch(() => {})
const receiptText = await saleStatus.innerText().catch(() => '')
const orderNumber = receiptText.match(/Receipt\s+(\S+)/)?.[1] ?? ''
step('complete a sale and show its receipt number', orderNumber.length > 0, orderNumber)

// 6. The database has the sale: the customer, the POS channel, the price, the cost and the stock.
const order = orderNumber ? await prisma.order.findUnique({ where: { orderNumber }, include: { items: true, paymentLines: true } }) : null
step('the sale is a till sale for the chosen customer', Boolean(order) && order.channel === 'POS' && order.userId === customer.id)
step('the sale total and the payment are $12.50', order?.grandTotal === 1250 && order?.paymentLines[0]?.usdCents === 1250)
step('the sold item keeps its cost', order?.items[0]?.costPrice === 500)
const stock = await prisma.inventoryItem.findFirst({ where: { productId: product.id, locationId: location.id } })
step('stock went down by one', stock?.quantity === 9, `quantity ${stock?.quantity}`)

// 7. Print the receipt in a new tab and check its content.
if (orderNumber) {
  const [receipt] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Print receipt' }).click()])
  await receipt.waitForLoadState('networkidle')
  const body = await receipt.locator('article.receipt').innerText().catch(() => '')
  step('the receipt opens with the sale and the brand', body.includes('YALLA HAUL') && body.includes(orderNumber) && body.includes('$12.50'))
  step('the receipt is set for an 80 mm printer by default', receipt.url().includes('width=80'))
  await receipt.close()

  // 7b. The same receipt on a 58 mm printer: 58 mm is about 219 CSS pixels wide.
  await page.goto(`${B}/admin/pos/receipts/${encodeURIComponent(orderNumber)}?width=58`, { waitUntil: 'networkidle' })
  const width58 = await page.locator('article.receipt').evaluate(el => parseFloat(getComputedStyle(el).width))
  step('the 58 mm receipt is 58 mm wide', Math.abs(width58 - 58 / 25.4 * 96) < 3, `${width58.toFixed(1)} px`)
}

// 7c. Tablet width: the till lays out without sideways scrolling.
await page.setViewportSize({ width: 768, height: 1024 })
await page.goto(`${B}/admin/pos`, { waitUntil: 'networkidle' })
const tabletFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
step('till fits a 768px tablet without sideways scrolling', tabletFits)

// 8. No page errors on the way.
step('no errors on the till pages', pageErrors.length === 0, pageErrors.join(' | '))

await browser.close()
await prisma.$disconnect()
const failed = results.filter(ok => !ok).length
console.log(`\n${results.length - failed} of ${results.length} checks passed`)
process.exit(failed ? 1 : 0)

// Launch-traffic test: simulated shoppers browse a store with real browsers -- each page with its
// link prefetches, images and data requests, the way customers' phones load them -- in steps of
// more and more shoppers at once, counting every request that fails. Meant for a hidden preview
// version (never the live store). Read-only: no account, no cart; the visitor beacon and every
// other site (analytics, ads) are blocked so the test leaves no trace in the store's data.
//
//   SHOPPERS=1,3,6,10 STEP_MINUTES=2 node scripts/e2e/browse-load.mjs <store URL>
//
// Exits 1 when any step had a failed request.
import { chromium } from 'playwright-core'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) throw new Error('Usage: browse-load.mjs <store URL>')
const host = new URL(BASE).host
const steps = (process.env.SHOPPERS || '1,3,6,10').split(',').map(Number).filter(n => n > 0)
const stepMs = Number(process.env.STEP_MINUTES || 2) * 60_000
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pick = list => list[Math.floor(Math.random() * list.length)]

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

const kind = request => {
  const url = new URL(request.url())
  if (request.resourceType() === 'document') return 'page'
  if (url.searchParams.has('_rsc') || request.headers()['rsc']) return 'page data'
  if (request.resourceType() === 'image' || url.pathname.startsWith('/api/media/') || url.pathname.startsWith('/api/image-proxy')) return 'image'
  if (url.pathname.startsWith('/api/')) return 'api'
  return 'other'
}

async function shopper(stats, until) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.host !== host) return route.abort()
    if (url.pathname.startsWith('/api/analytics/')) return route.fulfill({ status: 204, body: '' })
    return route.continue()
  })
  const page = await context.newPage()
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.host !== host || url.pathname.startsWith('/api/analytics/')) return
    const k = kind(response.request())
    const s = (stats.byKind[k] ??= { ok: 0, failed: 0 })
    if (response.status() >= 500) { s.failed++; stats.failures.push(`${k} ${url.pathname} ${response.status()}`) } else s.ok++
  })
  page.on('requestfinished', request => {
    if (new URL(request.url()).host !== host || kind(request) !== 'page') return
    const timing = request.timing()
    if (timing.responseEnd > 0) stats.pageMs.push(timing.responseEnd)
  })
  page.on('requestfailed', request => {
    const url = new URL(request.url())
    if (url.host !== host || url.pathname.startsWith('/api/analytics/')) return
    const error = request.failure()?.errorText || 'failed'
    if (/ERR_ABORTED/.test(error)) return // a prefetch or image the browser dropped on navigation
    const k = kind(request)
    ;(stats.byKind[k] ??= { ok: 0, failed: 0 }).failed++
    stats.failures.push(`${k} ${url.pathname} ${error}`)
  })
  try {
    // Arrive like a visitor from a link (home or the shop), then click around.
    await page.goto(BASE + pick(['/', '/', '/shop']), { timeout: 60_000 }).catch(() => undefined)
    while (Date.now() < until) {
      await sleep(4_000 + Math.random() * 6_000) // reading the page
      if (Date.now() >= until) break
      stats.navigations++
      const links = await page.$$eval('a[href^="/"]', anchors => anchors
        .filter(a => a.offsetParent !== null)
        .map(a => a.getAttribute('href'))
        .filter(href => /^\/(product\/|shop|collections|cart|$)/.test(href) && !href.startsWith('/api/'))).catch(() => [])
      const products = links.filter(href => href.startsWith('/product/'))
      const target = products.length && Math.random() < 0.5 ? pick(products) : links.length ? pick(links) : '/'
      if (Math.random() < 0.25) {
        // A new visit (a link from a post or an ad): a full page load.
        await page.goto(BASE + target, { timeout: 60_000 }).catch(() => undefined)
      } else {
        const clicked = await page.evaluate(href => {
          const a = [...document.querySelectorAll('a[href]')].find(el => el.getAttribute('href') === href && el.offsetParent !== null)
          if (!a) return false
          a.click()
          return true
        }, target).catch(() => false)
        if (!clicked) await page.goto(BASE + target, { timeout: 60_000 }).catch(() => undefined)
        else await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => undefined)
      }
    }
  } finally {
    await context.close().catch(() => undefined)
  }
}

async function probe() {
  return fetch(BASE + '/api/internal/db-probe', { signal: AbortSignal.timeout(30_000) })
    .then(async r => r.status === 200 ? JSON.stringify((await r.json()).clients) : `http ${r.status}`)
    .catch(() => 'no answer')
}

const percentile = (values, p) => {
  if (!values.length) return '-'
  const sorted = [...values].sort((a, b) => a - b)
  return `${Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))])}ms`
}

let failedSteps = 0
for (const count of steps) {
  const stats = { navigations: 0, byKind: {}, failures: [], pageMs: [] }
  const startedAt = new Date().toISOString()
  const until = Date.now() + stepMs
  // Shoppers arrive over the first 20 seconds, not all in the same instant.
  await Promise.all(Array.from({ length: count }, (_, i) => sleep((i * 20_000) / count).then(() => shopper(stats, until))))
  const requests = Object.values(stats.byKind).reduce((n, s) => n + s.ok + s.failed, 0)
  const failed = stats.failures.length
  if (failed) failedSteps++
  console.log(`\n${count} shopper(s) at once, ${stepMs / 60_000} min from ${startedAt}: ${stats.navigations} clicks, ${requests} requests to the store, ${failed} failed`)
  for (const [k, s] of Object.entries(stats.byKind)) console.log(`  ${k.padEnd(10)} ${s.ok} ok, ${s.failed} failed`)
  console.log(`  full page loads: median ${percentile(stats.pageMs, 50)}, slowest 5% ${percentile(stats.pageMs, 95)}`)
  if (failed) {
    const grouped = {}
    for (const f of stats.failures) grouped[f] = (grouped[f] || 0) + 1
    for (const [f, n] of Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  FAILED ${n}x ${f}`)
  }
  console.log(`  store isolate after the step: ${await probe()}`)
  await sleep(15_000)
}

await browser.close()
console.log(failedSteps ? `\n${failedSteps} of ${steps.length} step(s) had failed requests` : `\nNo failed request in ${steps.length} step(s)`)
process.exit(failedSteps ? 1 : 0)

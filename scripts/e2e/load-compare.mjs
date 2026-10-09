// Side-by-side load test: the same page loads against two stores at the same moments -- the
// PostgreSQL preview version and the live store -- counting the loads that fail on each. Read-only
// (plain page views). Fails when the new version fails clearly more often than the live one under
// realistic traffic, so a switch-over never makes the store less reliable than it is today.
//
//   node scripts/e2e/load-compare.mjs <new store URL> <live store URL> [product path]
//
// 50 one-at-a-time loads, 3 bursts of 10 simultaneous loads, and one shopper browsing a page every
// 2 seconds on one kept-alive connection (the pattern that failed live on 2026-10-09), per store:
// realistic traffic, kept light because it also reaches the live store.
const [, , NEW, LIVE, productPath = '/'] = process.argv
if (!NEW || !LIVE) throw new Error('Usage: load-compare.mjs <new URL> <live URL> [product path]')
const pages = ['/', '/shop', productPath, '/cart', '/collections']
const load = async (base, path, failed) => {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(60000) })
    await r.arrayBuffer()
    if (r.status !== 200) failed.push(`${path}=${r.status}`)
  } catch (e) { failed.push(`${path}=${e?.name === 'TimeoutError' ? 'timeout' : 'network error'}`) }
}
async function phase(name, run) {
  const failed = { new: [], live: [] }
  const total = await run(failed)
  for (const which of ['new', 'live']) console.log(`${name.padEnd(28)} ${which === 'new' ? 'new version' : 'live store '} ${total - failed[which].length}/${total} OK${failed[which].length ? ' -- failed ' + failed[which].join(' ') : ''}`)
  return failed
}
const sequential = () => phase('50 one at a time', async failed => {
  for (let i = 0; i < 50; i++) { const path = pages[i % pages.length]; await load(NEW, path, failed.new); await load(LIVE, path, failed.live) }
  return 50
})
const bursts = size => phase(`3 bursts of ${size} at once`, async failed => {
  for (let round = 0; round < 3; round++) {
    const burst = Array.from({ length: size }, (_, i) => pages[i % pages.length])
    await Promise.all(burst.flatMap(path => [load(NEW, path, failed.new), load(LIVE, path, failed.live)]))
    await new Promise(r => setTimeout(r, 2000))
  }
  return size * 3
})
// One shopper: a single kept-alive connection (like a browser), a page every 2 seconds. On the
// preview the store's own counters are printed every 10 pages (db-probe exists only there).
const shopper = () => phase('a shopper, a page every 2s', async failed => {
  const pagesSeen = ['/', '/shop', productPath, '/cart', '/collections', '/checkout']
  for (let i = 0; i < 40; i++) {
    const path = pagesSeen[i % pagesSeen.length]
    await Promise.all([load(NEW, path, failed.new), load(LIVE, path, failed.live)])
    if (i % 10 === 9) {
      const probe = await fetch(NEW + '/api/internal/db-probe', { signal: AbortSignal.timeout(30000) }).then(async r => r.status === 200 ? (await r.json()).clients : `http ${r.status}`).catch(() => 'no answer')
      console.log(`  after ${i + 1} shopper pages, new version isolate:`, JSON.stringify(probe))
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  return 40
})
const judged = [await sequential(), await bursts(10), await shopper()]
const newFailed = judged.reduce((n, f) => n + f.new.length, 0)
const liveFailed = judged.reduce((n, f) => n + f.live.length, 0)
const ok = newFailed <= liveFailed + 2
console.log(ok ? `PASS realistic traffic: the new version failed ${newFailed}, the live store ${liveFailed}` : `FAIL realistic traffic: the new version failed ${newFailed}, the live store ${liveFailed}`)
process.exit(ok ? 0 : 1)

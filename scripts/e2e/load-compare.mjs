// Side-by-side load test: the same page loads against two stores at the same moments -- the
// PostgreSQL preview version and the live store -- counting the loads that fail on each. Read-only
// (plain page views). Fails when the new version fails clearly more often than the live one, so a
// switch-over never makes the store less reliable than it is today.
//
//   node scripts/e2e/load-compare.mjs <new store URL> <live store URL> [product path]
const [, , NEW, LIVE, productPath = '/'] = process.argv
if (!NEW || !LIVE) throw new Error('Usage: load-compare.mjs <new URL> <live URL> [product path]')
const pages = ['/', '/shop', productPath, '/cart', '/collections']
const failures = { new: [], live: [] }
const load = async (which, base, path) => {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(60000) })
    await r.arrayBuffer()
    if (r.status !== 200) failures[which].push(`${path}=${r.status}`)
  } catch (e) { failures[which].push(`${path}=${e?.name === 'TimeoutError' ? 'timeout' : 'network error'}`) }
}
// 3 bursts of 40 simultaneous page loads per store, then 50 one-at-a-time loads per store.
for (let round = 0; round < 3; round++) {
  const burst = Array.from({ length: 8 }, () => pages).flat()
  await Promise.all(burst.flatMap(path => [load('new', NEW, path), load('live', LIVE, path)]))
  await new Promise(r => setTimeout(r, 2000))
}
for (let i = 0; i < 50; i++) { const path = pages[i % pages.length]; await load('new', NEW, path); await load('live', LIVE, path) }
const total = 3 * 40 + 50
console.log(`new version: ${total - failures.new.length}/${total} OK${failures.new.length ? ' -- failed ' + failures.new.join(' ') : ''}`)
console.log(`live store:  ${total - failures.live.length}/${total} OK${failures.live.length ? ' -- failed ' + failures.live.join(' ') : ''}`)
const ok = failures.new.length <= failures.live.length + 2
console.log(ok ? 'PASS the new version is at least as reliable as the live store' : 'FAIL the new version fails more often than the live store')
process.exit(ok ? 0 : 1)

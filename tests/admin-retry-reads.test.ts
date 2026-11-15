import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Every admin screen tries a read again when the host cut it off (lib/retry-fetch.ts, docs/admin-retry-reads-2026-11.md).
// Saves still go once: fetchRead passes anything but GET and HEAD straight through.
const read = (path: string) => readFileSync(path, 'utf8')
const components = readdirSync('components').filter(name => name.endsWith('.tsx'))

test('every component request helper reads through fetchRead', () => {
  let helpers = 0
  for (const name of components) {
    const src = read(`components/${name}`)
    const start = /^(?:export )?(?:async function api\(|const api = async|function api\()/m.exec(src)
    if (!start) continue
    helpers++
    const body = src.slice(start.index, src.indexOf('\n}\n', start.index))
    assert.match(body, /fetchRead\(/, name)
    assert.doesNotMatch(body, /(?<![\w.])fetch\(/, name)
  }
  assert.ok(helpers >= 45, `${helpers} helpers`)
})

test('one-line admin reads outside a helper go through fetchRead too', () => {
  for (const name of components) {
    for (const line of read(`components/${name}`).split('\n')) {
      if (/(?<![\w.])fetch\(['`]\/api\/admin/.test(line) && !/method|\{\s*$/.test(line)) assert.fail(`${name}: ${line.trim().slice(0, 100)}`)
    }
  }
})

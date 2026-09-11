import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { consumeRateLimit, clearRateLimit } from '@/lib/rate-limit'

describe('lib/rate-limit', () => {
  it('allows requests up to the limit and blocks the one after', () => {
    const key = `test:${Math.random()}`
    const limit = 3
    const windowMs = 60_000

    const first = consumeRateLimit(key, limit, windowMs)
    assert.equal(first.allowed, true)
    assert.equal(first.remaining, 2)

    const second = consumeRateLimit(key, limit, windowMs)
    assert.equal(second.allowed, true)
    assert.equal(second.remaining, 1)

    const third = consumeRateLimit(key, limit, windowMs)
    assert.equal(third.allowed, true)
    assert.equal(third.remaining, 0)

    const fourth = consumeRateLimit(key, limit, windowMs)
    assert.equal(fourth.allowed, false)
    assert.equal(fourth.remaining, 0)
    assert.ok(fourth.retryAfterSeconds > 0, 'a blocked request should report a positive retry-after')

    clearRateLimit(key)
  })

  it('tracks separate buckets per key', () => {
    const keyA = `test:${Math.random()}`
    const keyB = `test:${Math.random()}`
    consumeRateLimit(keyA, 1, 60_000)
    const blockedA = consumeRateLimit(keyA, 1, 60_000)
    const firstB = consumeRateLimit(keyB, 1, 60_000)

    assert.equal(blockedA.allowed, false, 'key A should be exhausted after its own limit')
    assert.equal(firstB.allowed, true, 'key B should be unaffected by key A being exhausted')

    clearRateLimit(keyA)
    clearRateLimit(keyB)
  })

  it('resets the count once the window has elapsed', () => {
    const key = `test:${Math.random()}`
    // A window of 1ms effectively expires immediately.
    const first = consumeRateLimit(key, 1, 1)
    assert.equal(first.allowed, true)

    // Busy-wait past the 1ms window rather than using a real timer, to keep this deterministic and fast.
    const until = Date.now() + 5
    while (Date.now() < until) { /* spin */ }

    const second = consumeRateLimit(key, 1, 1)
    assert.equal(second.allowed, true, 'a new window should reset the bucket instead of staying exhausted')

    clearRateLimit(key)
  })

  it('clearRateLimit removes a bucket so the next call starts fresh', () => {
    const key = `test:${Math.random()}`
    consumeRateLimit(key, 1, 60_000)
    const blocked = consumeRateLimit(key, 1, 60_000)
    assert.equal(blocked.allowed, false)

    clearRateLimit(key)

    const afterClear = consumeRateLimit(key, 1, 60_000)
    assert.equal(afterClear.allowed, true, 'clearing the bucket should let the next request through')

    clearRateLimit(key)
  })

  it('clearing an unknown key is a harmless no-op', () => {
    assert.doesNotThrow(() => clearRateLimit(`never-used:${Math.random()}`))
  })
})

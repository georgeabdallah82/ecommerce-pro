import test from 'node:test'
import assert from 'node:assert/strict'
import { databaseHealthy } from '../lib/health'

test('a database that answers is healthy', async () => {
  assert.equal(await databaseHealthy(async () => ({ key: 'x' })), true)
})

test('a database that errors is not healthy', async () => {
  assert.equal(await databaseHealthy(async () => { throw new Error('connection refused') }), false)
})

test('a database that does not answer in time is not healthy', async () => {
  const started = Date.now()
  assert.equal(await databaseHealthy(() => new Promise(() => {}), 50), false)
  assert.ok(Date.now() - started < 1000)
})

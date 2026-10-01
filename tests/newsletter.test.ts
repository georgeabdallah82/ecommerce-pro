import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listSubscribers, normalizeEmail, removeSubscriber, subscribeToNewsletter, subscribersToCsv } from '@/lib/newsletter'

describe('lib/newsletter', () => {
  describe('normalizeEmail', () => {
    it('trims and lowercases a valid address', () => {
      assert.equal(normalizeEmail('  Jane.Doe@Example.COM '), 'jane.doe@example.com')
    })
    it('rejects anything that is not a plausible email', () => {
      for (const bad of ['', 'nope', 'a@b', '@x.com', 'a b@x.com', 'a@x.c', 42, null, undefined, 'a@x.com'.padEnd(300, 'x')]) {
        assert.equal(normalizeEmail(bad as any), null, String(bad))
      }
    })
  })

  describe('subscribe / list / remove', () => {
    const email = `news-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

    it('subscribes once, is idempotent, lists, and removes', async () => {
      const first = await subscribeToNewsletter(email, 'footer')
      assert.equal(first.created, true)
      const second = await subscribeToNewsletter(email, 'homepage')
      assert.equal(second.created, false)

      const rows = (await listSubscribers()).filter(row => row.email === email)
      assert.equal(rows.length, 1, 'a repeat signup must not create a second row')
      assert.equal(rows[0].source, 'footer', 'the first source is kept')

      await removeSubscriber(email)
      assert.equal((await listSubscribers()).some(row => row.email === email), false)
    })
  })

  describe('subscribersToCsv', () => {
    it('quotes cells and neutralises spreadsheet formulas', () => {
      const csv = subscribersToCsv([{ email: '=cmd@x.com', subscribedAt: '2026-01-01T00:00:00.000Z', source: 'a"b' }])
      const [header, row] = csv.split('\n')
      assert.equal(header, 'Email,Subscribed at,Source')
      assert.ok(row.startsWith(`"'=cmd@x.com"`), row)
      assert.ok(row.includes('"a""b"'), row)
    })
  })
})

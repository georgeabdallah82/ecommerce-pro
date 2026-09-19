import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RESERVED_HANDLES } from '@/lib/reserved-handles'
import fs from 'node:fs'
import path from 'node:path'

describe('lib/reserved-handles', () => {
  it('covers every top-level app/ route segment', () => {
    const appDir = path.join(__dirname, '..', 'app')
    const segments = fs.readdirSync(appDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith('.') && !name.startsWith('[') && !name.startsWith('_'))

    for (const segment of segments) {
      assert.ok(RESERVED_HANDLES.has(segment), `app/${segment} is a real route but missing from RESERVED_HANDLES`)
    }
  })

  it('rejects an obviously reserved handle', () => {
    assert.equal(RESERVED_HANDLES.has('admin'), true)
    assert.equal(RESERVED_HANDLES.has('checkout'), true)
  })

  it('does not flag an ordinary page handle', () => {
    assert.equal(RESERVED_HANDLES.has('about-us'), false)
    assert.equal(RESERVED_HANDLES.has('faq'), false)
  })
})

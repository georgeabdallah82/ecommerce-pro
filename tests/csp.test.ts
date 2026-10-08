import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contentSecurityPolicy } from '@/lib/csp'

const directive = (policy: string, name: string) => policy.split('; ').find(d => d.startsWith(name + ' ')) || ''

describe('lib/csp', () => {
  it('only runs scripts that carry the request nonce', () => {
    const policy = contentSecurityPolicy('abc123', "'none'", false)
    const scripts = directive(policy, 'script-src')
    assert.match(scripts, /'nonce-abc123'/)
    assert.match(scripts, /'strict-dynamic'/)
    assert.doesNotMatch(scripts, /unsafe-eval/)
  })

  it('blocks plugins, <base> hijacking and framing by other sites', () => {
    const policy = contentSecurityPolicy('n', "'none'", false)
    assert.equal(directive(policy, 'object-src'), "object-src 'none'")
    assert.equal(directive(policy, 'base-uri'), "base-uri 'self'")
    assert.equal(directive(policy, 'frame-ancestors'), "frame-ancestors 'none'")
    assert.ok(policy.includes('upgrade-insecure-requests'))
  })

  it('lets only the theme preview be framed by the store itself', () => {
    assert.equal(directive(contentSecurityPolicy('n', "'self'", false), 'frame-ancestors'), "frame-ancestors 'self'")
  })

  it('allows the card gateway to receive the checkout form', () => {
    assert.match(directive(contentSecurityPolicy('n', "'none'", false), 'form-action'), /https:\/\/epayment\.areeba\.com/)
  })

  it('adds the dev-only allowances only in development', () => {
    const dev = contentSecurityPolicy('n', "'none'", true)
    assert.match(directive(dev, 'script-src'), /'unsafe-eval'/)
    assert.match(directive(dev, 'connect-src'), /ws:/)
    assert.ok(!dev.includes('upgrade-insecure-requests'))
  })
})

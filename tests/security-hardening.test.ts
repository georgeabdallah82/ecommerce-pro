import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { sniffUploadImageType } from '../lib/media-type'

// Security audit fixes: uploads are judged by their bytes, the payment-provider password never
// leaves the server through the generic settings API, and the payment webhook secret is compared
// in constant time.
const read = (file: string) => readFileSync(file, 'utf8')
const enc = (text: string) => new TextEncoder().encode(text)

describe('admin image uploads are judged by their content, not the sender\'s type', () => {
  it('accepts real images by their signature', () => {
    assert.equal(sniffUploadImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])), 'image/jpeg')
    assert.equal(sniffUploadImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), 'image/png')
    assert.equal(sniffUploadImageType(enc('GIF89a....')), 'image/gif')
    assert.equal(sniffUploadImageType(enc('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'image/webp')
  })
  it('accepts an SVG logo', () => {
    assert.equal(sniffUploadImageType(enc('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>')), 'image/svg+xml')
    assert.equal(sniffUploadImageType(enc('<svg viewBox="0 0 10 10"></svg>')), 'image/svg+xml')
  })
  it('refuses HTML, scripts and anything else, even when the sender calls it an image', () => {
    assert.equal(sniffUploadImageType(enc('<html><script>alert(1)</script></html>')), null)
    assert.equal(sniffUploadImageType(enc('<script>alert(1)</script>')), null)
    assert.equal(sniffUploadImageType(enc('MZ\u0090\u0000')), null)
    assert.equal(sniffUploadImageType(new Uint8Array([])), null)
  })
  it('the upload route uses the sniffed type and never the browser type', () => {
    const route = read('app/api/admin/media/upload/route.ts')
    assert.match(route, /sniffUploadImageType\(bytes\)/)
    assert.doesNotMatch(route, /file\.type/)
  })
})

describe('the payment provider password stays on the server', () => {
  it('the generic settings API hides it from reads and refuses writes to it', () => {
    assert.match(read('app/api/admin/settings/route.ts'), /'payment\.areeba\.apiPassword'\]/)
  })
})

describe('the payment webhook secret is compared in constant time', () => {
  it('uses timingSafeEqual instead of a plain comparison', () => {
    const route = read('app/api/internal/payment-status/route.ts')
    assert.match(route, /timingSafeEqual/)
    assert.doesNotMatch(route, /authorization'\) !== `Bearer/)
  })
})

describe('sign-up limits password length', () => {
  it('rejects passwords over 128 characters', () => {
    assert.match(read('app/account/register/server.ts'), /password\.length>128/)
  })
})

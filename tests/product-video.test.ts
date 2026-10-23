import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MAX_VIDEO_BYTES, cleanVideoUrl, isVideoKey, sniffVideoType } from '@/lib/product-video'
import { parseByteRange } from '@/lib/http-range'

const read = (path: string) => readFileSync(path, 'utf8')
const KEY = 'video-0123456789abcdef0123456789abcdef'
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...new TextEncoder().encode(brand), 0, 0, 0, 0])
const text = (s: string) => new TextEncoder().encode(s)

describe('product video: only real videos are kept', () => {
  it('recognises MP4 (and QuickTime) and WebM by their first bytes', () => {
    for (const brand of ['isom', 'mp42', 'avc1', 'qt  ', 'M4V ']) assert.equal(sniffVideoType(ftyp(brand)), 'mp4', brand)
    assert.equal(sniffVideoType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])), 'webm')
  })
  it('refuses photos that share the MP4 header, scripts, pages and anything else', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'avif', 'hevc']) assert.equal(sniffVideoType(ftyp(brand)), null, brand)
    assert.equal(sniffVideoType(text('<script>alert(1)</script>')), null)
    assert.equal(sniffVideoType(text('<!doctype html><html>')), null)
    assert.equal(sniffVideoType(text('GIF89a......')), null)
    assert.equal(sniffVideoType(new Uint8Array([])), null)
    assert.equal(sniffVideoType(new Uint8Array([0x1a, 0x45])), null)
    assert.equal(sniffVideoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), null) // a PNG
  })
  it('allows up to 25 MB', () => assert.equal(MAX_VIDEO_BYTES, 25 * 1024 * 1024))
})

describe('product video: the address a product may have', () => {
  it('accepts only the store\'s own uploaded video files', () => {
    assert.equal(cleanVideoUrl(`/api/media/${KEY}.mp4`), `/api/media/${KEY}.mp4`)
    assert.equal(cleanVideoUrl(` /api/media/${KEY}.webm `), `/api/media/${KEY}.webm`)
    assert.equal(cleanVideoUrl(`/uploads/${KEY}.mp4`), `/uploads/${KEY}.mp4`)
    assert.ok(isVideoKey(`${KEY}.mp4`))
  })
  it('drops other websites, scripts, pictures, private files and odd names', () => {
    for (const bad of ['https://evil.example/x.mp4', `https://yallahaul.com/api/media/${KEY}.mp4`, 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', '/api/media/1700000000-abc123.png', '/api/media/proof-0123456789abcdef0123456789abcdef.png', `/api/media/${KEY}.mp4?x=1`, `/api/media/../${KEY}.mp4`, `/api/media/${KEY}.gif`, '/api/media/video-123.mp4', '', null, undefined, 42, {}]) assert.equal(cleanVideoUrl(bad as any), null, String(bad))
  })
})

describe('video playback: byte ranges (iPhones will not play a video without them)', () => {
  it('sends the whole file when nothing was asked for, and reads the normal forms', () => {
    assert.equal(parseByteRange(null, 1000), null)
    assert.equal(parseByteRange('', 1000), null)
    assert.deepEqual(parseByteRange('bytes=0-99', 1000), { start: 0, end: 99 })
    assert.deepEqual(parseByteRange('bytes=900-', 1000), { start: 900, end: 999 })
    assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 })
    assert.deepEqual(parseByteRange('bytes=0-99999', 1000), { start: 0, end: 999 })
    assert.deepEqual(parseByteRange('bytes=0-0', 1000), { start: 0, end: 0 })
    assert.deepEqual(parseByteRange('bytes=-5000', 1000), { start: 0, end: 999 })
  })
  it('refuses what cannot be answered', () => {
    for (const bad of ['bytes=1000-', 'bytes=999999-', 'bytes=50-10', 'bytes=-', 'bytes=-0', 'bytes=a-b', 'items=0-1', 'bytes=0-1,5-9']) assert.equal(parseByteRange(bad, 1000), 'invalid', bad)
    assert.equal(parseByteRange('bytes=0-1', 0), 'invalid')
  })
})

describe('product video: wiring', () => {
  it('is uploaded by staff who manage media, checked by what it is, and limited in size', () => {
    const route = read('app/api/admin/media/video/route.ts')
    assert.match(route, /requirePermission\('media\.manage'\)/)
    assert.match(route, /sniffVideoType\(bytes\)/)
    assert.match(route, /MAX_VIDEO_BYTES \+ 64 \* 1024\) return json/)
    assert.match(route, /audit\(actor\.id, 'media\.video_uploaded'/)
  })
  it('is saved on a product only as one of the store\'s own files, and shown on the product page', () => {
    assert.match(read('app/api/admin/products/route.ts'), /videoUrl: cleanVideoUrl\(b\.videoUrl\)/)
    assert.match(read('app/api/admin/products/[id]/route.ts'), /data\.videoUrl=cleanVideoUrl\(b\.videoUrl\)/)
    assert.match(read('app/product/[slug]/page.tsx'), /videoUrl: cleanVideoUrl\(product\.videoUrl\)/)
    assert.match(read('components/aliexpress-product.tsx'), /<video src=\{product\.videoUrl\} controls playsInline preload="metadata"/)
    assert.match(read('components/product-editor-v2.tsx'), /fetch\('\/api\/admin\/media\/video'/)
  })
  it('is served with byte ranges and the private screenshots stay private', () => {
    const media = read('app/api/media/[key]/route.ts')
    assert.match(media, /parseByteRange\(wanted, head\.size\)/)
    assert.match(media, /status: 416/)
    assert.match(media, /accept-ranges/)
    assert.match(media, /key\.startsWith\('proof-'\)\) return new Response\('Not found'/)
  })
  it('adds one column and changes nothing that exists', () => {
    const sql = read('prisma/migrations/20261027000000_product_video/migration.sql').replace(/--.*$/gm, '').trim()
    assert.match(sql, /^ALTER TABLE "Product" ADD COLUMN\s+"videoUrl" TEXT;$/)
    assert.match(read('prisma/schema.prisma'), /videoUrl\s+String\?/)
  })
})

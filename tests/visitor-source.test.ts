import test from 'node:test'
import assert from 'node:assert/strict'
import { SOURCE_LABELS, sourceLabel, visitorSource } from '../lib/visitor-source'

const own = 'yallahaul.com'
const from = (referrer: string | null, landing: string | null = '/') => visitorSource({ referrer, landing, ownHost: own }).key

test('no referrer, or the store itself, is a direct visit', () => {
  assert.equal(from(null), 'direct')
  assert.equal(from(''), 'direct')
  assert.equal(from('https://yallahaul.com/cart'), 'direct')
  assert.equal(from('https://www.yallahaul.com/'), 'direct')
  assert.equal(from('https://shop.yallahaul.com/'), 'direct')
  assert.equal(from('not a url'), 'direct')
})

test('social apps and websites by their address', () => {
  assert.equal(from('https://l.instagram.com/?u=https%3A%2F%2Fyallahaul.com'), 'instagram')
  assert.equal(from('https://www.instagram.com/'), 'instagram')
  assert.equal(from('https://m.facebook.com/'), 'facebook')
  assert.equal(from('https://l.facebook.com/l.php?u=x'), 'facebook')
  assert.equal(from('https://api.whatsapp.com/send?phone=1'), 'whatsapp')
  assert.equal(from('https://wa.me/96170123456'), 'whatsapp')
  assert.equal(from('https://www.tiktok.com/@store'), 'tiktok')
  assert.equal(from('https://www.youtube.com/watch?v=1'), 'youtube')
  assert.equal(from('https://t.co/abc'), 'x')
  assert.equal(from('https://t.me/store'), 'telegram')
  assert.equal(from('https://mail.google.com/mail/u/0/'), 'email')
  assert.equal(from('android-app://com.google.android.gm'), 'email')
})

test('search engines: Google on its own, the rest together', () => {
  assert.equal(from('https://www.google.com/'), 'google')
  assert.equal(from('https://www.google.com.lb/'), 'google')
  assert.equal(from('https://google.co.uk/search?q=x'), 'google')
  assert.equal(from('https://www.bing.com/'), 'search')
  assert.equal(from('https://duckduckgo.com/'), 'search')
  assert.equal(from('https://search.yahoo.com/'), 'search')
})

test('a link tag the owner wrote wins over the address', () => {
  assert.equal(from('https://l.facebook.com/', '/?utm_source=instagram'), 'instagram')
  assert.equal(from(null, '/?utm_source=Newsletter&utm_medium=email'), 'email')
  assert.equal(from(null, '/?utm_source=whatsapp'), 'whatsapp')
  assert.equal(from(null, '/?utm_source=ig'), 'instagram')
  assert.equal(from(null, '/?utm_source=influencer-mia'), 'other')
  assert.equal(visitorSource({ referrer: null, landing: '/?utm_source=influencer-mia', ownHost: own }).host, 'influencer-mia')
})

test('the click tags that ad networks add', () => {
  assert.equal(from(null, '/?fbclid=abc'), 'facebook')
  assert.equal(from('https://l.instagram.com/', '/?fbclid=abc'), 'instagram')
  assert.equal(from(null, '/?igshid=abc'), 'instagram')
  assert.equal(from(null, '/?ttclid=abc'), 'tiktok')
  assert.equal(from(null, '/?gclid=abc'), 'google')
})

test('any other website is "other" and keeps its address for the report', () => {
  const r = visitorSource({ referrer: 'https://www.some-blog.example/post/1?x=1', landing: '/', ownHost: own })
  assert.deepEqual(r, { key: 'other', host: 'some-blog.example' })
  assert.equal(sourceLabel('other', 'some-blog.example'), 'some-blog.example')
  assert.equal(sourceLabel('other', null), SOURCE_LABELS.other)
  assert.equal(sourceLabel('instagram'), 'Instagram')
  assert.equal(sourceLabel('made-up-key'), SOURCE_LABELS.other)
})

test('every source has a plain name', () => {
  for (const [key, label] of Object.entries(SOURCE_LABELS)) assert.ok(label.length > 2 && !label.includes('_'), key)
})

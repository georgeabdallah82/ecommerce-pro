import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanInviteCode, inviteConfig, inviteLink, inviteRewardMessage, inviteShareMessage, makeInviteCode } from '@/lib/invites-shared'
import { winbackCustomers, winbackDays, winbackMessage, type WinbackOrder } from '@/lib/winback'
import { parseQuestion, questionAnsweredMessage } from '@/lib/product-questions'
import { isReviewPhotoUrl, parseReviewPhotos, reviewPhotoKey, sniffImageType } from '@/lib/review-photos'
import { questionsOn } from '@/lib/selling'

const plain = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

describe('invite a friend', () => {
  it('is off until switched on, with safe amounts', () => {
    assert.deepEqual(inviteConfig({}), { enabled: false, friendPercent: 10, reward: 500, rewardDays: 60 })
    assert.deepEqual(inviteConfig({ 'invite.enabled': 'true', 'invite.friendPercent': '15', 'invite.reward': '7.5', 'invite.rewardDays': '30' }), { enabled: true, friendPercent: 15, reward: 750, rewardDays: 30 })
    const odd = inviteConfig({ 'invite.enabled': 'true', 'invite.friendPercent': '90', 'invite.reward': '0', 'invite.rewardDays': '2' })
    assert.equal(odd.friendPercent, 50, 'at most 50 % off')
    assert.equal(odd.reward, 0, 'no thank-you amount means no thank-you code')
    assert.equal(odd.rewardDays, 7)
  })
  it('makes codes from the first name, or FRIEND for names in Arabic letters', () => {
    const fixed = () => 0
    assert.equal(makeInviteCode('Maya Haddad', fixed), 'MAYAAAA')
    assert.equal(makeInviteCode('Jean-Pierre', fixed), 'JEANPIAAA')
    assert.equal(makeInviteCode('مايا', fixed), 'FRIENDAAA')
    assert.equal(makeInviteCode('', fixed), 'FRIENDAAA')
    assert.match(makeInviteCode('Rami'), /^RAMI[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{3}$/, 'no 0/O or 1/I/L to mix up')
  })
  it('accepts only code-shaped text from a link or the code box', () => {
    assert.equal(cleanInviteCode(' maya4k7 '), 'MAYA4K7')
    assert.equal(cleanInviteCode('MAYA 4K7'), '')
    assert.equal(cleanInviteCode('<script>'), '')
    assert.equal(cleanInviteCode('ab'), '')
  })
  it('writes the share link and messages', () => {
    assert.equal(inviteLink('https://yallahaul.com/', 'MAYA4K7'), 'https://yallahaul.com/?invite=MAYA4K7')
    const share = inviteShareMessage({ storeName: 'Yalla Haul', code: 'MAYA4K7', percent: 10, link: 'https://yallahaul.com/?invite=MAYA4K7' }, plain)
    assert.equal(share, 'I shop at Yalla Haul. Use my code MAYA4K7 for 10% off your first order:\nhttps://yallahaul.com/?invite=MAYA4K7')
    const thanks = inviteRewardMessage({ storeName: 'Yalla Haul', inviterName: 'Maya', friendName: 'Rami', amount: '$5.00', code: 'THANKSAB2CD', expires: '15 Dec 2026', siteUrl: 'https://yallahaul.com' })
    assert.match(thanks, /^Hi Maya! Your friend Rami received their order from Yalla Haul\./)
    assert.match(thanks, /Use code THANKSAB2CD at checkout \(valid until 15 Dec 2026\)\./)
  })
})

describe('win back', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
  let id = 0
  const order = (phone: string, status: string, days: number, total = 2000, name = 'Maya Haddad'): WinbackOrder => ({ id: `o${++id}`, orderNumber: String(1000 + id), status, grandTotal: total, currency: 'USD', createdAt: daysAgo(days), phone, shippingAddressJson: JSON.stringify({ firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '' }) })
  it('groups by phone however it was typed, and keeps only quiet customers who got an order', () => {
    const orders = [
      order('70 123 456', 'DELIVERED', 100, 3000), order('+961 70123456', 'DELIVERED', 80, 2000),
      order('71 111 111', 'DELIVERED', 10), // ordered recently
      order('03 222 222', 'DELIVERED', 90), order('03222222', 'PENDING', 1), // has an order on the way
      order('76 333 333', 'CANCELLED', 120), // never received anything
      order('81 444 444', 'DELIVERED', 200, 9000, 'Rami Khoury'),
    ]
    const list = winbackCustomers(orders, { days: 60, storeCountry: 'Lebanon', now })
    assert.deepEqual(list.map(c => c.phone), ['96181444444', '96170123456'], 'best customers first')
    assert.equal(list[1].delivered, 2)
    assert.equal(list[1].spent, 5000)
    assert.equal(list[1].daysSince, 80, 'counted from the latest order')
    assert.equal(list[0].name, 'Rami Khoury')
  })
  it('skips blocked numbers and respects the chosen period', () => {
    const orders = [order('70 555 555', 'DELIVERED', 45)]
    assert.equal(winbackCustomers(orders, { days: 30, storeCountry: 'Lebanon', now }).length, 1)
    assert.equal(winbackCustomers(orders, { days: 60, storeCountry: 'Lebanon', now }).length, 0)
    assert.equal(winbackCustomers(orders, { days: 30, storeCountry: 'Lebanon', now, blocked: new Set(['96170555555']) }).length, 0)
    assert.equal(winbackDays('90'), 90)
    assert.equal(winbackDays('7'), 60)
  })
  it('mentions the code only when there is one', () => {
    assert.doesNotMatch(winbackMessage({ storeName: 'Yalla Haul', name: 'Maya Haddad', code: '', siteUrl: 'https://yallahaul.com' }), /code/)
    assert.match(winbackMessage({ storeName: 'Yalla Haul', name: 'Maya Haddad', code: 'COMEBACK10', siteUrl: 'https://yallahaul.com' }), /^Hi Maya! [\s\S]*Use code COMEBACK10/)
  })
})

describe('product questions', () => {
  it('needs a name and a real question; the phone is optional', () => {
    assert.deepEqual(parseQuestion({ productId: 'p1', name: '  Maya  ', question: ' Is it   big? ', phone: '' }).value, { productId: 'p1', name: 'Maya', question: 'Is it big?', phone: '' })
    assert.equal(parseQuestion({ productId: 'p1', name: '', question: 'Is it big?' }).error, 'Please add your name.')
    assert.equal(parseQuestion({ productId: 'p1', name: 'Maya', question: 'hi' }).error, 'Please write your question.')
    assert.equal(parseQuestion({ productId: 'p1', name: 'Maya', question: 'x'.repeat(501) }).error, 'Your question is too long.')
  })
  it('turns away bots that fill the hidden field', () => {
    assert.ok(parseQuestion({ productId: 'p1', name: 'Maya', question: 'Is it big?', website: 'http://spam' }).error)
  })
  it('is on unless switched off, and the answer message names the product', () => {
    assert.equal(questionsOn({}), true)
    assert.equal(questionsOn({ 'product.questions': 'false' }), false)
    const msg = questionAnsweredMessage({ storeName: 'Yalla Haul', name: 'Maya H', productName: 'Tote bag', answer: 'Yes, 40 cm wide.', link: 'https://yallahaul.com/product/tote#questions' })
    assert.match(msg, /^Hi Maya! Thank you for your question about Tote bag at Yalla Haul\.\n\nYes, 40 cm wide\./)
  })
})

describe('review photos', () => {
  it('knows a photo by its first bytes, not its name', () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
    assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp')
    assert.equal(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>')), null)
  })
  it('accepts only review photo addresses this store made', () => {
    assert.ok(isReviewPhotoUrl('/api/media/review-1760000000000-ab12cd34.jpg'))
    assert.ok(isReviewPhotoUrl('/uploads/review-1760000000000-ab12cd34.png'))
    assert.ok(!isReviewPhotoUrl('/api/media/1760000000000-logo.jpg'))
    assert.ok(!isReviewPhotoUrl('/api/media/review-../../secret.jpg'))
    assert.ok(!isReviewPhotoUrl('https://evil.example/review-1760000000000-ab12cd34.jpg'))
    assert.equal(reviewPhotoKey('/api/media/review-1760000000000-ab12cd34.jpg'), 'review-1760000000000-ab12cd34.jpg')
    assert.equal(reviewPhotoKey('/api/media/other.jpg'), '')
    assert.deepEqual(parseReviewPhotos(undefined), { photos: [] })
    assert.ok(parseReviewPhotos('x').error)
  })
})

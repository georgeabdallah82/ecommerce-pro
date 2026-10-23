import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MAX_ACTIVE, MAX_NOTICE_TEXT, MAX_STORED, activeNotices, addNotice, cleanNoticeText, expiryFor, isActive, keepChoice, noticeAge, noticeAlert, normalizeNotices, removeNotice, type Notice,
} from '../lib/team-notices'
import { ROLE_PERMISSIONS, hasPermission } from '../lib/permissions'
import { PERMISSION_SECTIONS } from '../lib/permission-groups'

const NOW = new Date('2026-10-23T12:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const notice = (n: number, over: Partial<Notice> = {}): Notice => ({ id: `notice${String(n).padStart(3, '0')}`, text: `Message ${n}`, createdAt: at(n), expiresAt: null, authorName: 'Owner', alerted: false, ...over })

test('the message is one tidy paragraph, cut to the limit', () => {
  assert.equal(cleanNoticeText('  No   deliveries\n\nSunday  '), 'No deliveries Sunday')
  assert.equal(cleanNoticeText('x'.repeat(900)).length, MAX_NOTICE_TEXT)
  for (const junk of [null, undefined, 5, {}, [], '', '   ']) assert.equal(cleanNoticeText(junk), '')
})

test('how long a notice stays', () => {
  assert.equal(expiryFor('1d', NOW), '2026-10-24T12:00:00.000Z')
  assert.equal(expiryFor('3d', NOW), '2026-10-26T12:00:00.000Z')
  assert.equal(expiryFor('7d', NOW), '2026-10-30T12:00:00.000Z')
  assert.equal(expiryFor('until', NOW), null)
  assert.equal(keepChoice('7d'), '7d')
  for (const junk of ['forever', '', null, undefined, 3]) assert.equal(keepChoice(junk), '3d')
})

test('stored notices are read leniently: junk dropped, duplicates removed, newest first', () => {
  const list = normalizeNotices([
    notice(5), notice(2), notice(9), notice(2),
    { id: 'x', text: 'bad id', createdAt: at(1) },
    { id: 'goodid123', text: '   ', createdAt: at(1) },
    { id: 'goodid124', text: 'no date', createdAt: 'nope' },
    null, 'text', 7,
  ])
  assert.deepEqual(list.map(n => n.id), ['notice002', 'notice005', 'notice009'])
  assert.deepEqual(normalizeNotices(JSON.stringify([notice(1)])).map(n => n.id), ['notice001'])
  for (const junk of [undefined, null, '', 'not json', '{}', 5, {}]) assert.deepEqual(normalizeNotices(junk as any), [], String(junk))
  assert.equal(normalizeNotices([notice(1, { authorName: '' })])[0].authorName, 'Staff')
  assert.equal(normalizeNotices(Array.from({ length: 80 }, (_, i) => notice(i + 1))).length, MAX_STORED)
})

test('only unexpired notices show, at most five', () => {
  assert.equal(isActive(notice(1, { expiresAt: new Date(NOW.getTime() + 1000).toISOString() }), NOW), true)
  assert.equal(isActive(notice(1, { expiresAt: new Date(NOW.getTime() - 1000).toISOString() }), NOW), false)
  assert.equal(isActive(notice(1, { expiresAt: new Date(NOW.getTime()).toISOString() }), NOW), false, 'expired exactly now')
  assert.equal(isActive(notice(1, { expiresAt: null }), NOW), true)
  const many = Array.from({ length: 8 }, (_, i) => notice(i + 1))
  assert.equal(activeNotices(many, NOW).length, MAX_ACTIVE)
  assert.deepEqual(activeNotices([notice(1, { expiresAt: at(5) }), notice(2)], NOW).map(n => n.id), ['notice002'])
})

test('posting: newest first, and refused while five are showing', () => {
  let list: Notice[] = []
  for (let i = 5; i >= 1; i--) {
    const added = addNotice(list, notice(i), NOW)
    assert.ok(added.ok)
    if (added.ok) list = added.list
  }
  assert.deepEqual(list.map(n => n.id), ['notice001', 'notice002', 'notice003', 'notice004', 'notice005'])
  const sixth = addNotice(list, notice(0), NOW)
  assert.ok(!sixth.ok && /5 notices/.test(sixth.error))
  // An expired one does not count as showing, so there is room.
  const room = addNotice([...list.slice(0, 4), notice(6, { expiresAt: at(1) })], notice(0), NOW)
  assert.ok(room.ok && room.list[0].id === 'notice000')
  // Old notices beyond the memory limit are forgotten, never the newest.
  const full = Array.from({ length: MAX_STORED }, (_, i) => notice(i + 10, { expiresAt: at(1) }))
  const next = addNotice(full, notice(1), NOW)
  assert.ok(next.ok && next.list.length === MAX_STORED && next.list[0].id === 'notice001')
})

test('removing one leaves the rest', () => {
  assert.deepEqual(removeNotice([notice(1), notice(2)], 'notice001').map(n => n.id), ['notice002'])
  assert.equal(removeNotice([notice(1)], 'nope').length, 1)
})

test('how old a notice is, in plain words', () => {
  assert.equal(noticeAge(at(0), NOW), 'just now')
  assert.equal(noticeAge(at(5), NOW), '5 min ago')
  assert.equal(noticeAge(at(180), NOW), '3 h ago')
  assert.equal(noticeAge(at(60 * 24 * 5), NOW), '5 days ago')
  assert.equal(noticeAge(new Date(NOW.getTime() + 60000).toISOString(), NOW), 'just now')
})

test('the phone alert carries the author and the start of the message', () => {
  assert.deepEqual(noticeAlert({ text: 'No deliveries Sunday', authorName: 'Mia' }), { title: 'Team notice from Mia', body: 'No deliveries Sunday', url: '/admin' })
  const long = noticeAlert({ text: 'word '.repeat(80).trim(), authorName: 'Mia' })
  assert.ok(long.body.length <= 140 && long.body.endsWith('...'))
})

test('who may post: the owner, admins and managers; support and editors only read', () => {
  assert.equal(hasPermission('SUPER_ADMIN', 'notices.manage'), true)
  assert.equal(hasPermission('ADMIN', 'notices.manage'), true)
  assert.equal(hasPermission('MANAGER', 'notices.manage'), true)
  for (const role of ['SUPPORT', 'EDITOR', 'CUSTOMER'] as const) assert.equal(ROLE_PERMISSIONS[role].includes('notices.manage'), false, role)
  const listed = PERMISSION_SECTIONS.flatMap(s => s.areas).some(a => a.manage === 'notices.manage')
  assert.ok(listed, 'it can be given to a custom role in Users & roles')
})

const read = (p: string) => readFileSync(p, 'utf8')

test('wiring: posting needs the permission, is audited and rate limited; only staff see the board; the launch wipe leaves notices alone', () => {
  const route = read('app/api/admin/notices/route.ts')
  assert.equal((route.match(/requirePermission\('notices\.manage'\)/g) || []).length, 2)
  assert.match(route, /audit\(actor\.id, 'notice\.created'/)
  assert.match(route, /audit\(actor\.id, 'notice\.removed'/)
  assert.match(route, /consumeDurableRateLimit\(`team-notice:\$\{actor\.id\}`/)
  assert.match(read('app/admin/layout.tsx'), /user\.role !== 'CUSTOMER' \? activeNotices\(/)
  assert.match(read('app/admin/layout.tsx'), /permission: 'notices\.manage', icon: 'notices'/)
  assert.match(read('app/admin/notices/page.tsx'), /requirePermission\('notices\.manage'\)/)
  assert.ok(!/team\.notices/.test(read('scripts/launch-cleanup.mjs')), 'the launch wipe may only delete a short fixed list of settings; notices can be real messages')
  assert.ok(!/team\.notices|TEAM_NOTICES/.test(read('app/api/store/settings/route.ts')), 'never public')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pagedReply, readPaging } from '../lib/admin-paging'

const read = (path: string) => readFileSync(path, 'utf8')
const params = (query: string) => new URLSearchParams(query)

test('a list reads skip and take, with a default, a ceiling and a floor', () => {
  assert.deepEqual(readPaging(params(''), 50, 200), { skip: 0, take: 50 })
  assert.deepEqual(readPaging(params('skip=100&take=25'), 50, 200), { skip: 100, take: 25 })
  assert.deepEqual(readPaging(params('take=500'), 50, 200), { skip: 0, take: 200 })
  assert.deepEqual(readPaging(params('take=0'), 50, 200), { skip: 0, take: 1 })
  assert.deepEqual(readPaging(params('take=2.9'), 50, 200), { skip: 0, take: 2 })
  assert.deepEqual(readPaging(params('skip=-4'), 50, 200), { skip: 0, take: 50 })
  assert.deepEqual(readPaging(params('skip=99999999'), 50, 200), { skip: 100000, take: 50 })
})

test('a missing, empty or non-numeric value takes the default, not 1', () => {
  // clampInt reads a missing value as 0, which would make the page size 1.
  assert.deepEqual(readPaging(params('take=&skip='), 50, 200), { skip: 0, take: 50 })
  assert.deepEqual(readPaging(params('take=abc'), 50, 200), { skip: 0, take: 50 })
  assert.deepEqual(readPaging(params('take=%20%20'), 48, 120), { skip: 0, take: 48 })
})

test('every paged reply carries the rows, the total and the window', () => {
  assert.deepEqual(pagedReply(['a', 'b'], 9, 0, 2), { rows: ['a', 'b'], total: 9, skip: 0, take: 2 })
})

test('the activity, media and collection lists all page on the server', () => {
  for (const route of ['app/api/admin/activity/route.ts', 'app/api/admin/media/route.ts', 'app/api/admin/collections/route.ts']) {
    assert.match(read(route), /readPaging\(searchParams,/, route)
  }
  const media = read('app/api/admin/media/route.ts')
  assert.match(media, /db\.mediaAsset\.findMany\(\{ where, orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\], skip, take \}\)/, 'the library query is paged')
  assert.match(media, /db\.mediaAsset\.count\(\{ where \}\)/)
  assert.match(read('app/admin/media/page.tsx'), /total=\{total\}/, 'the Files page is given the total')
  const collections = read('app/api/admin/collections/route.ts')
  assert.match(collections, /orderBy: \[\{ sortOrder: 'asc' \}, \{ updatedAt: 'desc' \}, \{ id: 'asc' \}\], skip, take/, 'the collection query is paged in a stable order')
  assert.match(collections, /counts: \{ all, active, inactive \}/, 'the tabs count the whole catalogue, not one page')
})

test('the collection pickers ask for up to 200 and read the rows', () => {
  assert.match(read('components/product-export-dialog.tsx'), /api\/admin\/collections\?take=200[\s\S]*data\?\.rows/)
  assert.match(read('components/coupons-admin-pro.tsx'), /api\/admin\/collections\?take=200/)
  assert.match(read('components/coupons-admin-pro.tsx'), /Array\.isArray\(c\?\.rows\)/)
  assert.match(read('components/theme-studio.tsx'), /api\/admin\/collections\?take=200/)
})

test('the long lists have a Load more control', () => {
  assert.match(read('components/media-admin-pro.tsx'), /Load more/)
  assert.match(read('components/media-picker.tsx'), /Load more/)
  assert.match(read('components/collections-admin-shopify.tsx'), /Load more/)
})

test('search and the status filter for collections run on the server, not over a partial list', () => {
  const list = read('components/collections-admin-shopify.tsx')
  assert.doesNotMatch(list, /const filtered = useMemo/)
  assert.match(list, /listQuery\(0, PAGE, term, status\)/)
})

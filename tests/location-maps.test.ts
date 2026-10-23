import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_MAP_VIEW, groupDots, roundPlace } from '../lib/visitor-map'
import { cleanCheckoutPlace, placeLine } from '../lib/checkout-place'

test('a visitor\'s place is rounded to about 10 km before it is kept', () => {
  assert.deepEqual(roundPlace(33.8938, 35.5018), { lat: 33.9, lng: 35.5 })
  assert.deepEqual(roundPlace('33.8938', '35.5018'), { lat: 33.9, lng: 35.5 })
  assert.deepEqual(roundPlace(-33.86, 151.21), { lat: -33.9, lng: 151.2 })
  assert.deepEqual(roundPlace(39.9612, -82.9988), { lat: 40, lng: -83 })
  // Two visitors in the same part of a city land on exactly the same dot.
  assert.deepEqual(roundPlace(33.8801, 35.4902), roundPlace(33.9049, 35.5149))
})

test('a place that is missing or not real is dropped', () => {
  for (const [a, b] of [[undefined, undefined], [null, null], ['', ''], ['x', 'y'], [0, 0], ['0', '0'], [91, 10], [10, 181], [Number.NaN, 5], [5, Infinity]]) {
    assert.equal(roundPlace(a, b), null, `${a},${b}`)
  }
  assert.deepEqual(roundPlace(0, 35.5), { lat: 0, lng: 35.5 }, 'the equator alone is a real place')
})

test('visitors at the same rounded place become one dot with a number', () => {
  const groups = groupDots([
    { lat: 33.9, lng: 35.5, label: 'Home' },
    { lat: 33.9, lng: 35.5, label: 'Cart' },
    { lat: 34.4, lng: 35.8, label: 'Shop' },
    { lat: 33.9, lng: 35.5, label: 'Checkout' },
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0], { lat: 33.9, lng: 35.5, count: 3, labels: ['Home', 'Cart', 'Checkout'] })
  assert.deepEqual(groups[1], { lat: 34.4, lng: 35.8, count: 1, labels: ['Shop'] })
  assert.deepEqual(groupDots([]), [])
  assert.equal(groupDots(Array.from({ length: 9 }, () => ({ lat: 1, lng: 1, label: 'x' })))[0].labels.length, 5, 'at most five names per dot')
})

test('the map starts on the store\'s own country', () => {
  assert.ok(DEFAULT_MAP_VIEW.lat > 33 && DEFAULT_MAP_VIEW.lat < 34.7 && DEFAULT_MAP_VIEW.lng > 35 && DEFAULT_MAP_VIEW.lng < 36.7)
})

test('an unfinished checkout keeps the town and area typed, and an exact spot only when it is real and in the country', () => {
  const ok = cleanCheckoutPlace({ city: '  Jounieh ', area: 'Keserwan', pin: { lat: 33.9808, lng: 35.6178, accuracy: 12.4 } }, 'LB')
  assert.deepEqual(ok, { city: 'Jounieh', area: 'Keserwan', pin: { lat: 33.9808, lng: 35.6178, accuracy: 12 } })
  // A pin from abroad (someone ordering for family) is dropped; the typed words stay.
  const abroad = cleanCheckoutPlace({ city: 'Beirut', pin: { lat: 40.7, lng: -74 } }, 'LB')
  assert.equal(abroad.pin, null)
  assert.equal(abroad.city, 'Beirut')
  // "No fix" and junk are dropped.
  for (const pin of [{ lat: 0, lng: 0 }, { lat: 'x', lng: 'y' }, null, undefined, 5, 'x', {}]) assert.equal(cleanCheckoutPlace({ pin }, 'LB').pin, null, JSON.stringify(pin))
  // Outside the countries we check, a real pin is kept.
  assert.ok(cleanCheckoutPlace({ pin: { lat: 40.7, lng: -74 } }, 'US').pin)
  // Words are tidied and limited.
  assert.equal(cleanCheckoutPlace({ city: 'a   b\n c' }, 'LB').city, 'a b c')
  assert.equal(cleanCheckoutPlace({ city: 'x'.repeat(200) }, 'LB').city.length, 60)
  assert.deepEqual(cleanCheckoutPlace(null, 'LB'), { city: '', area: '', pin: null })
  assert.deepEqual(cleanCheckoutPlace({ city: 7, area: {} } as any, 'LB'), { city: '', area: '', pin: null })
})

test('the list line: town and area, without repeating the same word', () => {
  assert.equal(placeLine({ city: 'Jounieh', area: 'Keserwan' }), 'Jounieh, Keserwan')
  assert.equal(placeLine({ city: 'Beirut', area: 'beirut' }), 'Beirut')
  assert.equal(placeLine({ city: null, area: 'Metn' }), 'Metn')
  assert.equal(placeLine({ city: 'Saida', area: null }), 'Saida')
  assert.equal(placeLine({ city: '', area: '' }), '')
})

const read = (path: string) => readFileSync(path, 'utf8')

test('wiring: checkout sends the place, the server saves it, only staff who see unfinished checkouts get exact pins', () => {
  const page = read('app/checkout/page.tsx')
  assert.match(page, /city, area: areaTyped, pin: pin \? \{ lat: pin\.lat, lng: pin\.lng, accuracy: pin\.accuracy \} : null/)
  assert.match(page, /useEffect\(\(\) => \{ if \(pin\) captureCheckoutProgress\(formRef\.current\) \}, \[pin\]\)/)
  const route = read('app/api/checkout/progress/route.ts')
  assert.match(route, /cleanCheckoutPlace\(b, /)
  assert.match(route, /pinLat: place\.pin\.lat/)
  assert.match(read('app/api/admin/visitors/route.ts'), /pins: hasPermission\(user, 'abandonedCheckouts\.view'\)/)
  assert.match(read('app/admin/live-visitors/page.tsx'), /pins: hasPermission\(user, 'abandonedCheckouts\.view'\)/)
  assert.match(read('lib/visitor-report.ts'), /options\.pins\s*\n?\s*\? db\.abandonedCheckout\.findMany/)
})

test('wiring: the map uses OpenStreetMap with its attribution, and nothing is built from visitor-supplied text as HTML', () => {
  const map = read('components/visitors-map.tsx')
  assert.match(map, /tile\.openstreetmap\.org/)
  assert.match(map, /OpenStreetMap/)
  assert.match(map, /textContent/)
  assert.ok(!/bindPopup\(`|bindPopup\('|innerHTML/.test(map), 'popups are built from text nodes, never HTML strings')
  assert.match(read('components/visitors-live.tsx'), /dynamic\(\(\) => import\('\.\/visitors-map'\), \{ ssr: false/)
})

test('the new columns only add: nothing is dropped or changed', () => {
  const sql = read('prisma/migrations/20261029000000_location_maps/migration.sql')
  assert.ok(!/DROP|DELETE|ALTER COLUMN|TRUNCATE/i.test(sql))
  for (const column of ['placeLat', 'placeLng', 'pinLat', 'pinLng', 'pinAccuracy', 'city', 'area']) assert.ok(sql.includes(`"${column}"`), column)
})

test('a custom role that may see reports but not unfinished checkouts gets no exact pins', async () => {
  const { hasPermission } = await import('../lib/permissions')
  const reportsOnly = { role: 'MANAGER' as const, permissions: ['reports.view' as const] }
  assert.equal(hasPermission(reportsOnly, 'reports.view'), true)
  assert.equal(hasPermission(reportsOnly, 'abandonedCheckouts.view'), false)
  assert.equal(hasPermission('SUPER_ADMIN', 'abandonedCheckouts.view'), true)
})

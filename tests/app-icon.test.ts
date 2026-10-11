import test from 'node:test'
import assert from 'node:assert/strict'
import { appIconSource, appShortName, appleTouchIcon, manifestIcons } from '../lib/app-icon'

test('the name under the icon fits a phone home screen', () => {
  assert.equal(appShortName('Yalla Haul'), 'Yalla Haul')
  assert.equal(appShortName('  Yalla   Haul  '), 'Yalla Haul')
  assert.equal(appShortName('Yalla Haul Lebanon Store'), 'Yalla')
  assert.equal(appShortName('Supercalifragilistic'), 'Supercalifra')
})

test('the icon is made from the favicon, else the logo', () => {
  assert.equal(appIconSource({ faviconUrl: '/api/media/fav.png', logoUrl: '/api/media/logo.png' }), '/api/media/fav.png')
  assert.equal(appIconSource({ faviconUrl: '', logoUrl: 'https://cdn.example/logo.webp' }), 'https://cdn.example/logo.webp')
  assert.equal(appIconSource({ faviconUrl: 'javascript:alert(1)', logoUrl: '//evil.example/x.png' }), '')
})

test('saved icons are listed with their sizes, also as a maskable icon', () => {
  const icons = manifestIcons({ large: '/api/media/a512.png', small: '/api/media/a192.png' }, '/api/media/fav.png')
  assert.deepEqual(icons.map(i => [i.src, i.sizes, i.purpose]), [
    ['/api/media/a192.png', '192x192', 'any'],
    ['/api/media/a512.png', '512x512', 'any'],
    ['/api/media/a512.png', '512x512', 'maskable'],
  ])
})

test('without a saved icon the favicon or logo is used as it is', () => {
  assert.deepEqual(manifestIcons({}, '/api/media/logo.svg'), [{ src: '/api/media/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }])
  assert.deepEqual(manifestIcons({ large: '' }, ''), [])
})

test('iPhones get a PNG, never an SVG', () => {
  assert.equal(appleTouchIcon({ large: '/l.png', small: '/s.png' }, '/fav.png'), '/s.png')
  assert.equal(appleTouchIcon({}, '/fav.png'), '/fav.png')
  assert.equal(appleTouchIcon({}, '/logo.svg'), '')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AR } from '../lib/i18n-ar'
import { countOf, isTranslatableKey, localize, resolveLang, translate } from '../lib/i18n'

// Every English text the storefront passes to t() / tr() / markT() must have its Arabic in
// lib/i18n-ar.ts, or Arabic shoppers would see English in the middle of an Arabic page.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'admin' || name === 'node_modules' ? [] : files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
export function usedTexts() {
  const found = new Map<string, string>()
  const pattern = /\b(?:t|tr|markT)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g
  for (const file of [...files('app'), ...files('components'), ...files('lib')]) {
    if (/admin|theme-studio|theme-section|theme-inspector|navigation-editor|i18n\.test/.test(file)) continue
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(pattern)) {
      const text = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"')
      if (!found.has(text)) found.set(text, file)
    }
  }
  return found
}

test('every storefront text has its Arabic', () => {
  const missing = [...usedTexts()].filter(([text]) => !Object.prototype.hasOwnProperty.call(AR, text)).map(([text, file]) => `${file}: ${text}`)
  assert.deepEqual(missing, [])
})

test('Arabic texts keep the same {placeholders} as the English', () => {
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  const wrong = Object.entries(AR).filter(([en, ar]) => holes(en) !== holes(ar)).map(([en]) => en)
  assert.deepEqual(wrong, [])
})

test('translate fills placeholders and falls back to English', () => {
  assert.equal(translate('en', 'Add {name} to cart', { name: 'Cup' }), 'Add Cup to cart')
  assert.equal(translate('ar', 'A text nobody translated'), 'A text nobody translated')
  assert.notEqual(translate('ar', 'Add to cart'), 'Add to cart')
})

test('Arabic counts use the right noun form', () => {
  assert.equal(countOf('en', 1, 'product'), '1 product')
  assert.equal(countOf('en', 3, 'product'), '3 products')
  assert.equal(countOf('ar', 1, 'product'), 'منتج واحد')
  assert.equal(countOf('ar', 2, 'product'), 'منتجان')
  assert.equal(countOf('ar', 5, 'product'), '5 منتجات')
  assert.equal(countOf('ar', 11, 'product'), '11 منتج')
})

test('Arabic is shown only once the owner switches it on, or in the editor preview; admin stays English', () => {
  const on = { arabic: true, defaultLang: 'en' as const }
  assert.equal(resolveLang({ path: '/', cookie: 'ar', settings: { arabic: false } }), 'en')
  assert.equal(resolveLang({ path: '/', cookie: 'ar', preview: true, settings: { arabic: false } }), 'ar')
  assert.equal(resolveLang({ path: '/', cookie: 'ar', settings: on }), 'ar')
  assert.equal(resolveLang({ path: '/', settings: on }), 'en')
  assert.equal(resolveLang({ path: '/', settings: { arabic: true, defaultLang: 'ar' } }), 'ar')
  assert.equal(resolveLang({ path: '/', cookie: 'en', settings: { arabic: true, defaultLang: 'ar' } }), 'en')
  assert.equal(resolveLang({ path: '/admin/orders', cookie: 'ar', settings: on }), 'en')
})

test("the owner's Arabic texts replace the English; links and settings are never touched", () => {
  const sections = [{ settings: { heading: 'Summer deals', headingAr: 'عروض الصيف', buttonLabel: 'Shop now', buttonUrl: '/shop', textAlign: 'left', note: 'Typed by the owner' }, blocks: [{ settings: { text: 'Free delivery', textAr: '' } }] }]
  const out = localize(sections, 'ar')
  assert.equal(out[0].settings.heading, 'عروض الصيف')
  assert.equal(out[0].settings.buttonLabel, AR['Shop now'])
  assert.equal(out[0].settings.buttonUrl, '/shop')
  assert.equal(out[0].settings.textAlign, 'left')
  assert.equal(out[0].settings.note, 'Typed by the owner')
  assert.equal(out[0].blocks[0].settings.text, 'Free delivery', 'an empty Arabic box keeps the English')
  assert.equal(localize(sections, 'en'), sections)
  assert.equal(localize([{ label: 'Kitchen', labelAr: 'المطبخ', url: '/collections/kitchen' }], 'ar')[0].label, 'المطبخ')
  assert.equal(localize({ areas: 'Beirut | Tomorrow', areasAr: 'بيروت | غداً' }, 'ar').areas, 'بيروت | غداً')
  for (const key of ['buttonUrl', 'imageUrl', 'textAlign', 'textColor', 'icon', 'id', 'customCss']) assert.equal(isTranslatableKey(key), false, key)
})

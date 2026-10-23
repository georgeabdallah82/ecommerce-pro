import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { defaultTheme as DEFAULT_THEME } from '@/lib/theme-defaults'

// Every font family that is preloaded is downloaded on every page. All ten families used to be, about
// 360 KB on each first visit. Only the store's default font may be preloaded; the others load when
// text actually uses them (a theme editor choice).
describe('font preloading', () => {
  const source = readFileSync('lib/fonts.ts', 'utf8')
  const declarations = [...source.matchAll(/^const (\w+) = (\w+)\(\{(.*)\}\)$/gm)].map(m => ({ name: m[1], options: m[3] }))
  it('finds the font families', () => assert.ok(declarations.length >= 10, String(declarations.length)))
  it('preloads only the default family', () => {
    const preloaded = declarations.filter(d => !/preload:\s*false/.test(d.options)).map(d => d.name)
    assert.deepEqual(preloaded, [String((DEFAULT_THEME as any).typography.heading)])
  })
  it('the default heading and body font are the same family, so one preload covers both', () => {
    const t = (DEFAULT_THEME as any).typography
    assert.equal(t.heading, t.body)
  })
})

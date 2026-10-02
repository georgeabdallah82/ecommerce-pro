import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adminAccentCss, adminAccentVars, adminBrandCss, adminBrandVars, contrast, parseHex, ADMIN_DARK_SURFACE } from '@/lib/admin-accent'

const rgb = (hex: string) => parseHex(hex)!

describe('lib/admin-accent', () => {
  for (const primary of ['#ff0000', '#d42a2a', '#008060', '#ffd400', '#7fffd4', '#1a1a1a', '#ffffff', '#123']) {
    it(`${primary}: text on the accent and accent text on tints stay readable (AA 4.5:1)`, () => {
      const vars = adminAccentVars(primary)!
      for (const mode of ['light', 'dark'] as const) {
        const v = vars[mode]
        assert.ok(contrast(rgb(v['--admin-accent']), rgb(v['--admin-accent-ink'])) >= 4.5, `${mode}: button text`)
        assert.ok(contrast(rgb(v['--admin-accent-strong']), rgb(v['--admin-accent-soft'])) >= 4.5, `${mode}: strong on soft`)
      }
      assert.ok(contrast(rgb(vars.dark['--admin-accent']), ADMIN_DARK_SURFACE) >= 4.5, 'dark: accent on surface')
      assert.ok(contrast(rgb(vars.light['--admin-accent']), rgb('#ffffff')) >= 3, 'light: accent visible on the white page')
    })
  }

  it('keeps the brand hue: a red store gets a red admin, not green', () => {
    const [r, g, b] = rgb(adminAccentVars('#ff0000')!.light['--admin-accent'])
    assert.ok(r > 180 && g < 40 && b < 40)
  })

  it('ignores invalid colours (the admin keeps its default accent)', () => {
    assert.equal(adminAccentVars('red'), null)
    assert.equal(adminAccentCss(undefined), '')
  })

  const store = { background: '#fffaf6', surface: '#ffffff', text: '#191512', muted: '#746b64', primary: '#ff0000', secondary: '#fff0e8', border: '#eaded4', success: '#16805b', warning: '#b7791f', sale: '#d92d20' }

  it('uses the store palette for the light admin: page, cards, borders, text and statuses', () => {
    const { light, dark } = adminBrandVars(store)!
    assert.equal(light['--admin-bg'], '#fffaf6')
    assert.equal(light['--admin-surface'], '#ffffff')
    assert.equal(light['--admin-border'], '#eaded4')
    assert.equal(light['--admin-ink'], '#191512')
    assert.equal(light['--admin-muted'], '#746b64')
    // Status colours keep the brand shade, nudged darker only as far as readability on their tint needs.
    const near = (a: string, b: string) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 12)
    assert.ok(near(light['--admin-success'], '#16805b'), light['--admin-success'])
    assert.ok(light['--admin-warning'] && light['--admin-success-soft'] && light['--admin-topbar-bg'])
    assert.equal(light['--admin-accent'], adminAccentVars('#ff0000')!.light['--admin-accent'])
    // Dark mode keeps its own dark neutrals; only the accent and statuses follow the brand.
    assert.equal(dark['--admin-bg'], undefined)
    assert.ok(dark['--admin-accent'] && dark['--admin-success'])
  })

  for (const colors of [store, { background: '#111111', surface: '#1c1c1c', text: '#f5f5f5', muted: '#999999', primary: '#ffd400', border: '#333333', success: '#4ade80', warning: '#fde047' }, { text: '#777777', muted: '#cccccc', success: '#aaffaa', warning: '#ffff00' }]) {
    it(`stays readable for ${colors.background || 'a partial'} palette`, () => {
      const { light, dark } = adminBrandVars(colors)!
      const page = rgb(light['--admin-bg'] || '#f6f5f0')
      const surface = rgb(light['--admin-surface'] || '#ffffff')
      for (const bg of [page, surface]) {
        if (light['--admin-ink']) assert.ok(contrast(rgb(light['--admin-ink']), bg) >= 7, 'ink')
        if (light['--admin-ink-soft']) assert.ok(contrast(rgb(light['--admin-ink-soft']), bg) >= 4.5, 'ink-soft')
        if (light['--admin-muted']) assert.ok(contrast(rgb(light['--admin-muted']), bg) >= 4.5, 'muted')
      }
      for (const name of ['success', 'warning']) {
        assert.ok(contrast(rgb(light[`--admin-${name}`]), surface) >= 4.5, `light ${name} on card`)
        assert.ok(contrast(rgb(light[`--admin-${name}`]), rgb(light[`--admin-${name}-soft`])) >= 4.5, `light ${name} on tint`)
        assert.ok(contrast(rgb(dark[`--admin-${name}`]), ADMIN_DARK_SURFACE) >= 4.5, `dark ${name} on card`)
        assert.ok(contrast(rgb(dark[`--admin-${name}`]), rgb(dark[`--admin-${name}-soft`])) >= 4.5, `dark ${name} on tint`)
      }
    })
  }

  it('never turns the light admin dark: a dark store background is skipped', () => {
    const light: Record<string, string> = adminBrandVars({ background: '#111111', surface: '#1c1c1c', text: '#f5f5f5', border: '#333333' })?.light || {}
    assert.equal(light['--admin-bg'], undefined)
    assert.equal(light['--admin-surface'], undefined)
    assert.equal(light['--admin-ink'], undefined)
    assert.equal(light['--admin-border'], undefined)
  })

  it('emits nothing for a missing palette', () => {
    assert.equal(adminBrandCss(undefined), '')
    assert.equal(adminBrandCss({}), '')
  })
})

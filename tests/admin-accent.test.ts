import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adminAccentCss, adminAccentVars, contrast, parseHex, ADMIN_DARK_SURFACE } from '@/lib/admin-accent'

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
})

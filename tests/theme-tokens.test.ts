import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { defaultTheme } from '@/lib/theme-defaults'

// The storefront reads the theme through CSS custom properties (--store-*). A studio setting
// only reaches the live site if the root layout sets its variable, and only shows in the
// editor preview if the preview frame sets it too. "Sale" colour was editable for a long time
// while nothing set --store-sale, so it silently did nothing.

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function sourceFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory()) { if (!/^(admin|zz-)/.test(name)) sourceFiles(rel, out); continue }
    if (/\.(css|tsx?)$/.test(name) && !/theme-studio|theme-section-inspector/.test(name)) out.push(rel)
  }
  return out
}

const usedVars = new Set<string>()
for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
  for (const match of read(file).matchAll(/var\((--store-[a-z0-9-]+)/g)) usedVars.add(match[1])
}
usedVars.delete('--store-x') // a placeholder in a comment

const setVars = (path: string) => new Set([...read(path).matchAll(/'(--store-[a-z0-9-]+)'/g)].map(m => m[1]))

describe('theme -> CSS variables', () => {
  it('the live layout sets every --store-* variable the storefront CSS reads', () => {
    const set = setVars('app/layout.tsx')
    const missing = [...usedVars].filter(name => !set.has(name))
    assert.deepEqual(missing, [], `app/layout.tsx never sets: ${missing.join(', ')}`)
  })

  it('the editor preview sets the same variables as the live layout', () => {
    const live = setVars('app/layout.tsx')
    const preview = setVars('components/theme-preview-frame.tsx')
    const missing = [...live].filter(name => !preview.has(name))
    assert.deepEqual(missing, [], `theme-preview-frame.tsx never sets: ${missing.join(', ')}`)
  })

  it('every colour in the theme defaults reaches the storefront', () => {
    // Colours with their own variable (colors.sale -> --store-sale, colors.primary -> --store-primary ...).
    const layout = read('app/layout.tsx')
    const unwired = Object.keys(defaultTheme.colors).filter(key => !new RegExp(`theme\\.colors\\.${key}\\b`).test(layout))
    // success/warning are not editable in the studio and nothing reads them.
    assert.deepEqual(unwired.filter(key => !['success', 'warning'].includes(key)), [])
  })
})

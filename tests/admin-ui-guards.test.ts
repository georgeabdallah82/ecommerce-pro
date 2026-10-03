import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

// Guards for the admin UI/UX audit: destructive actions look destructive (outlined, never the
// brand-coloured primary) and always ask first through the styled dialog.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const adminComponents = readdirSync(join(root, 'components'))
  .filter(name => name.endsWith('.tsx'))
  .map(name => `components/${name}`)
  .filter(path => read(path).includes("from './admin-ui.module.css'"))

describe('admin destructive actions', () => {
  it('confirm through the styled dialog, not the browser popup', () => {
    const native = adminComponents.filter(path => path !== 'components/admin-confirm.tsx').filter(path => /window\.confirm\(|(?<![.\w])confirm\((?!\{)/.test(read(path).replace(/await confirm\(\{/g, '')))
    assert.deepEqual(native, [])
  })

  it('draw trash buttons as outlined danger buttons', () => {
    const plain = adminComponents.flatMap(path => (read(path).match(/<button[^>]*title="Delete[^"]*"[^>]*>/g) || [])
      .filter(tag => !tag.includes('iconBtnDanger'))
      .map(tag => `${path}: ${tag.slice(0, 80)}`))
    assert.deepEqual(plain, [])
  })

  it('keep danger buttons outlined (transparent), solid only inside the confirm dialog', () => {
    const css = read('components/admin-ui.module.css')
    for (const cls of ['iconBtnDanger', 'btnDanger']) {
      const rule = new RegExp(`\\.${cls} \\{[^}]*\\}`).exec(css)?.[0] || ''
      assert.match(rule, /background: transparent/, cls)
    }
    assert.match(read('components/admin-confirm.tsx'), /btnDangerSolid/)
  })

  it('mounts the confirm dialog for every admin page', () => {
    assert.match(read('app/admin/layout.tsx'), /<ConfirmProvider>/)
  })
})

describe('admin on phones', () => {
  it('turns resource tables into cards instead of clipping columns', () => {
    for (const path of ['components/orders-admin-shopify.tsx', 'components/admin-products-list.tsx', 'components/customers-admin.tsx']) {
      assert.match(read(path), /ui\.cardTable/, path)
      assert.match(read(path), /data-cell="primary"/, path)
    }
  })

  it('lists staff as rows that restack on phones, not a wide table', () => {
    assert.doesNotMatch(read('components/users-roles-admin.tsx'), /<table/)
    assert.match(read('components/admin-users.module.css'), /@media \(max-width: 900px\) \{\s*\.userRow \{ grid-template-columns/)
  })

  it('keeps stat cards two per row on small phones', () => {
    assert.doesNotMatch(read('app/admin/admin-overhaul.css'), /catalogStats\{grid-template-columns:1fr!important\}/)
  })
})
